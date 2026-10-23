"""Simulator: talk to any tenant's receptionist by text using the same brain and tools as live calls."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import Me, Session, owned
from app.models import Call, Tenant
from app.services import agent, calls, events, profiles
from app.services.tools import ToolContext

router = APIRouter(prefix="/demo", tags=["demo"])
_STATE: dict[str, dict] = {}  # per-call scratch state for the offline agent


class StartIn(BaseModel):
    from_number: str = "+447700900123"
    channel: str = "sim"


class MessageIn(BaseModel):
    text: str


async def _ctx(session, tenant_id: str, call: Call) -> ToolContext:
    profile, _ = await profiles.get_live(session, tenant_id)
    return ToolContext(session=session, tenant_id=tenant_id, profile=profile, call=call, state=_STATE.setdefault(call.id, {}))


async def start(session, tenant_id: str, body: StartIn) -> dict:
    call, profile, info = await calls.start_call(session, tenant_id, from_number=body.from_number, channel=body.channel)
    ctx = await _ctx(session, tenant_id, call)
    text = await agent.greet(ctx)
    return {"call_id": call.id, "reply": text, "caller": info}


async def message(session, tenant_id: str, call_id: str, text: str) -> dict:
    call = await owned(session, Call, call_id, tenant_id)
    if call.status != "live":
        raise HTTPException(409, "Call has ended")
    ctx = await _ctx(session, tenant_id, call)
    out = await agent.reply(ctx, text)
    events.publish(tenant_id, "call.transcript", {"call_id": call.id, "role": "user", "text": text})
    events.publish(tenant_id, "call.transcript", {"call_id": call.id, "role": "assistant", "text": out})
    ended = bool(ctx.state.get("ended"))
    if ended:
        await calls.finish_call(session, call)
        _STATE.pop(call.id, None)
    return {"reply": out, "ended": ended, "outcome": call.outcome, "transfer": ctx.state.get("transfer")}


async def end(session, tenant_id: str, call_id: str) -> dict:
    call = await owned(session, Call, call_id, tenant_id)
    if call.status == "live":
        await calls.finish_call(session, call)
    _STATE.pop(call.id, None)
    return {"outcome": call.outcome, "summary": call.summary, "extracted": call.extracted}


@router.post("/sessions")
async def start_session(body: StartIn, p: Me, session: Session):
    return await start(session, p.tenant_id, body)


@router.post("/sessions/{call_id}/message")
async def send_message(call_id: str, body: MessageIn, p: Me, session: Session):
    return await message(session, p.tenant_id, call_id, body.text)


@router.post("/sessions/{call_id}/end")
async def end_session(call_id: str, p: Me, session: Session):
    return await end(session, p.tenant_id, call_id)


# Public chat widget for a business's website (text channel of the same receptionist).
@router.post("/public/{slug}/sessions")
async def public_start(slug: str, body: StartIn, session: Session):
    tenant = await session.scalar(select(Tenant).where(Tenant.slug == slug, Tenant.active))
    if tenant is None:
        raise HTTPException(404, "Unknown business")
    return await start(session, tenant.id, StartIn(from_number=body.from_number, channel="web"))


@router.post("/public/{slug}/sessions/{call_id}/message")
async def public_message(slug: str, call_id: str, body: MessageIn, session: Session):
    tenant = await session.scalar(select(Tenant).where(Tenant.slug == slug, Tenant.active))
    if tenant is None:
        raise HTTPException(404, "Unknown business")
    return await message(session, tenant.id, call_id, body.text)
