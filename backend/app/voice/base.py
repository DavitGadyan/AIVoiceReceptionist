"""Voice provider contract. Business logic stays in services/; providers only translate."""

from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any

from app.schemas.profile import BusinessProfile


class VoiceProvider(ABC):
    name: str

    @abstractmethod
    def assistant_config(self, profile: BusinessProfile, at: datetime, caller: dict[str, Any]) -> dict[str, Any]:
        """Provider-native assistant definition built from the tenant profile."""

    @abstractmethod
    async def attach_number(self, provider_ref: str) -> dict[str, Any]:
        """Point a provider phone number at our webhook so calls resolve to a tenant."""


def get_provider(name: str) -> VoiceProvider:
    from app.voice.pipecat import PipecatProvider
    from app.voice.retell import RetellProvider
    from app.voice.vapi import VapiProvider

    providers: dict[str, type[VoiceProvider]] = {"vapi": VapiProvider, "retell": RetellProvider, "pipecat": PipecatProvider}
    if name not in providers:
        raise ValueError(f"Unknown voice provider {name}")
    return providers[name]()
