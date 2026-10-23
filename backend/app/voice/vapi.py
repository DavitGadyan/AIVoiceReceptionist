"""Vapi adapter: transient assistants per call, server-side tools, end-of-call reports."""

from datetime import datetime
from typing import Any

import httpx

from app.core.config import get_settings
from app.schemas.profile import BusinessProfile
from app.services.hours import is_open
from app.services.prompt_builder import build_system_prompt, render_greeting
from app.services.tools import TOOL_SCHEMAS
from app.voice.base import VoiceProvider

VOICE_MAP = {"11labs": "11labs", "elevenlabs": "11labs", "cartesia": "cartesia", "openai": "openai", "deepgram": "deepgram", "azure": "azure"}


class VapiProvider(VoiceProvider):
    name = "vapi"
    api = "https://api.vapi.ai"

    def server(self) -> dict[str, Any]:
        s = get_settings()
        out: dict[str, Any] = {"url": f"{s.public_base_url.rstrip('/')}/voice/vapi/events"}
        if s.vapi_webhook_secret:
            out["secret"] = s.vapi_webhook_secret
        return out

    def assistant_config(self, profile: BusinessProfile, at: datetime, caller: dict[str, Any]) -> dict[str, Any]:
        s = get_settings()
        open_now = is_open(profile, at)
        transfer_to = profile.transfer_number or next((e.phone for e in profile.escalation if e.phone), "")
        live_transfer = bool(transfer_to and open_now)

        tools: list[dict[str, Any]] = []
        for t in TOOL_SCHEMAS:
            fn = t["function"]
            if fn["name"] == "end_call":
                continue  # Vapi's native endCall handles hang-up
            if fn["name"] == "transfer_to_human" and live_transfer:
                continue  # replaced by native warm transfer below
            tools.append({"type": "function", "function": fn, "server": self.server(), "async": False})
        if live_transfer:
            tools.append({
                "type": "transferCall",
                "destinations": [{
                    "type": "number", "number": transfer_to,
                    "message": "Of course, connecting you now — one moment.",
                    "transferPlan": {"mode": "warm-transfer-say-summary",
                                     "summaryPlan": {"enabled": True}},
                }],
            })

        system = build_system_prompt(profile, at)
        if caller.get("caller_name"):
            system += f"\nThe caller is a known contact: {caller['caller_name']}. Greet them by first name."
        if caller.get("repeat_calls_10m", 0) >= 2:
            system += "\nThis number has called several times in the last few minutes — they may have an unresolved problem; be extra helpful."

        lang = profile.voice.language
        return {
            "name": f"{profile.business_name} receptionist"[:40],
            "firstMessage": render_greeting(profile, at),
            "firstMessageMode": profile.voice.first_message_mode,
            "model": {
                "provider": "openai",
                "model": s.openai_chat_model,
                "temperature": 0.4,
                "messages": [{"role": "system", "content": system}],
                "tools": tools,
            },
            "voice": {"provider": VOICE_MAP.get(profile.voice.provider, profile.voice.provider),
                      "voiceId": profile.voice.voice_id, "speed": profile.voice.speed},
            "transcriber": {"provider": "deepgram", "model": "nova-2", "language": lang.split("-")[0] if lang else "en",
                            "smartFormat": True},
            "backgroundSound": profile.voice.background_sound,
            "endCallFunctionEnabled": True,
            "recordingEnabled": profile.compliance.record_calls,
            "silenceTimeoutSeconds": 30,
            "maxDurationSeconds": 1200,
            "startSpeakingPlan": {"waitSeconds": 0.4, "smartEndpointingEnabled": True},
            "stopSpeakingPlan": {"numWords": 2, "voiceSeconds": 0.2, "backoffSeconds": 1},
            "messagePlan": {"idleMessages": ["Are you still there?"], "idleTimeoutSeconds": 12},
            "serverMessages": ["end-of-call-report", "status-update", "tool-calls", "transcript", "hang"],
            "server": self.server(),
            "metadata": {"profile_business": profile.business_name},
        }

    async def attach_number(self, provider_ref: str) -> dict[str, Any]:
        s = get_settings()
        if not s.vapi_api_key:
            return {"attached": False, "reason": "VAPI_API_KEY not set"}
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.patch(f"{self.api}/phone-number/{provider_ref}",
                              headers={"Authorization": f"Bearer {s.vapi_api_key}"},
                              json={"assistantId": None, "server": self.server()})
        return {"attached": r.status_code < 400, "status": r.status_code}


def extract_numbers(message: dict[str, Any]) -> tuple[str, str, str]:
    """(provider_call_id, from_number, to_number) from any Vapi server message."""
    call = message.get("call") or {}
    customer = message.get("customer") or call.get("customer") or {}
    phone = message.get("phoneNumber") or call.get("phoneNumber") or {}
    return call.get("id", ""), customer.get("number", ""), phone.get("number", "")


def transcript_from_report(message: dict[str, Any]) -> list[dict[str, Any]]:
    artifact = message.get("artifact") or {}
    raw = artifact.get("messages") or message.get("messages") or []
    out: list[dict[str, Any]] = []
    for m in raw:
        role = m.get("role")
        if role in ("bot", "assistant"):
            out.append({"role": "assistant", "text": m.get("message") or m.get("content", "")})
        elif role == "user":
            out.append({"role": "user", "text": m.get("message") or m.get("content", "")})
        elif role in ("tool_calls", "tool_call_result"):
            continue
    if not out and (artifact.get("transcript") or message.get("transcript")):
        for line in (artifact.get("transcript") or message.get("transcript")).splitlines():
            who, _, text = line.partition(":")
            out.append({"role": "assistant" if who.strip().upper() in ("AI", "BOT", "ASSISTANT") else "user", "text": text.strip()})
    return out
