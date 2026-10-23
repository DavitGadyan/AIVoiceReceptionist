"""Public webhooks called by the voice platform. Tenant is resolved from the dialed number."""

import hmac
import logging
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Header, HTTPException, Request
from sqlalchemy import select

from app.api.deps import Session
from app.core.config import get_settings
from app.models import Call, Tenant
from app.services import calls, events, profiles
from app.services.tools import ToolContext, run_tool
from app.voice.vapi import VapiProvider, extract_numbers, transcript_from_report

router = APIRouter(prefix="/voice", tags=["voice"])
log = logging.getLogger(__name__)


def _check_secret(header: str | None) -> None:
    secret = get_settings().vapi_webhook_secret
    if secret and not (header and hmac.compare_digest(header, secret)):
        raise HTTPException(401, "Bad webhook secret")


async def _tenant_for(session, message: dict[str, Any]) -> str:
    call = message.get("call") or {}
    meta_tenant = (call.get("metadata") or {}).get("tenant_id") or ((call.get("assistantOverrides") or {}).get("metadata") or {}).get("tenant_id")
    if meta_tenant:
        return meta_tenant
    _, _, to_number = extract_numbers(message)
    tenant_id = await calls.resolve_tenant(session, to_number) if to_number else None
    if not tenant_id:
        raise HTTPException(404, f"No tenant for number {to_number!r}")
    return tenant_id


@router.post("/vapi/events")
async def vapi_events(request: Request, session: Session, x_vapi_secret: str | None = Header(default=None)):
    _check_secret(x_vapi_secret)
    body = await request.json()
    message = body.get("message") or body
    kind = message.get("type")
    tenant_id = await _tenant_for(session, message)
    provider_call_id, from_number, to_number = extract_numbers(message)

    if kind == "assistant-request":
        call, profile, info = await calls.start_call(session, tenant_id, from_number=from_number, to_number=to_number,
                                                     provider="vapi", provider_call_id=provider_call_id)
        if info.get("blocked"):
            call.outcome = "BLOCKED"
            await calls.finish_call(session, call, transcript=[])
            return {"error": "This number is not accepting calls from you."}
        assistant = VapiProvider().assistant_config(profile, datetime.now(ZoneInfo(profile.timezone)), info)
        assistant["metadata"] = {**assistant.get("metadata", {}), "tenant_id": tenant_id, "call_id": call.id}
        return {"assistant": assistant}

    call = await session.scalar(select(Call).where(Call.tenant_id == tenant_id, Call.provider_call_id == provider_call_id))
    if call is None:
        call, _, _ = await calls.start_call(session, tenant_id, from_number=from_number, to_number=to_number,
                                            provider="vapi", provider_call_id=provider_call_id)

    if kind == "tool-calls":
        profile, _ = await profiles.get_live(session, tenant_id)
        ctx = ToolContext(session=session, tenant_id=tenant_id, profile=profile, call=call)
        results = []
        for tc in message.get("toolCallList") or message.get("toolCalls") or []:
            fn = tc.get("function") or {}
            args = fn.get("arguments") or {}
            if isinstance(args, str):
                import json

                args = json.loads(args or "{}")
            out = await run_tool(ctx, fn.get("name", ""), args)
            results.append({"toolCallId": tc.get("id"), "name": fn.get("name"), "result": __import__("json").dumps(out, default=str)})
        await session.commit()
        return {"results": results}

    if kind == "transcript" and message.get("transcriptType") == "final":
        role = "assistant" if message.get("role") in ("assistant", "bot") else "user"
        events.publish(tenant_id, "call.transcript", {"call_id": call.id, "role": role, "text": message.get("transcript", "")})
        return {"ok": True}

    if kind == "status-update":
        events.publish(tenant_id, "call.status", {"call_id": call.id, "status": message.get("status")})
        return {"ok": True}

    if kind == "end-of-call-report":
        await calls.finish_call(
            session, call,
            transcript=transcript_from_report(message),
            recording_url=(message.get("artifact") or {}).get("recordingUrl") or message.get("recordingUrl", ""),
            duration_seconds=int(message.get("durationSeconds") or 0) or None,
            cost_usd=message.get("cost"),
            ended_reason=message.get("endedReason", ""),
        )
        return {"ok": True}

    return {"ok": True, "ignored": kind}


@router.get("/web-assistant/{slug}")
async def web_assistant(slug: str, session: Session):
    """Public: config for the browser 'talk to the receptionist' demo via the Vapi Web SDK."""
    tenant = await session.scalar(select(Tenant).where(Tenant.slug == slug, Tenant.active))
    if tenant is None:
        raise HTTPException(404, "Unknown business")
    profile, _ = await profiles.get_live(session, tenant.id)
    assistant = VapiProvider().assistant_config(profile, datetime.now(ZoneInfo(profile.timezone)), {})
    assistant["metadata"] = {"tenant_id": tenant.id}
    return {"public_key": get_settings().vapi_public_key, "assistant": assistant, "business_name": profile.business_name}
