"""Self-hosted pipeline adapter (stub): Twilio/Telnyx media streams → Pipecat (Deepgram, OpenAI, Cartesia).

The worker would call the same /voice/tool endpoint, so tenants can move off a managed
platform to ~$0.03-0.05/min without touching business logic.
"""

from datetime import datetime
from typing import Any

from app.schemas.profile import BusinessProfile
from app.services.prompt_builder import build_system_prompt, render_greeting
from app.services.tools import TOOL_SCHEMAS
from app.voice.base import VoiceProvider


class PipecatProvider(VoiceProvider):
    name = "pipecat"

    def assistant_config(self, profile: BusinessProfile, at: datetime, caller: dict[str, Any]) -> dict[str, Any]:
        return {
            "system_prompt": build_system_prompt(profile, at),
            "greeting": render_greeting(profile, at),
            "tools": TOOL_SCHEMAS,
            "stt": {"provider": "deepgram", "model": "nova-2"},
            "tts": {"provider": "cartesia", "voice": profile.voice.voice_id},
        }

    async def attach_number(self, provider_ref: str) -> dict[str, Any]:
        return {"attached": False, "reason": "Pipecat worker not yet implemented"}
