"""Retell AI adapter (stub). Same contract as Vapi: dynamic variables + custom functions hitting our tools."""

from datetime import datetime
from typing import Any

from app.schemas.profile import BusinessProfile
from app.services.prompt_builder import build_system_prompt, render_greeting
from app.services.tools import TOOL_SCHEMAS
from app.voice.base import VoiceProvider


class RetellProvider(VoiceProvider):
    name = "retell"

    def assistant_config(self, profile: BusinessProfile, at: datetime, caller: dict[str, Any]) -> dict[str, Any]:
        return {
            "general_prompt": build_system_prompt(profile, at),
            "begin_message": render_greeting(profile, at),
            "general_tools": [
                {"type": "custom", "name": t["function"]["name"], "description": t["function"]["description"],
                 "parameters": t["function"]["parameters"], "url": "/voice/retell/tool"}
                for t in TOOL_SCHEMAS
            ],
        }

    async def attach_number(self, provider_ref: str) -> dict[str, Any]:
        return {"attached": False, "reason": "Retell adapter not yet implemented"}
