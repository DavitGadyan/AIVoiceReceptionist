"""The business profile: everything that makes one tenant's receptionist different.

Onboarding a new client means filling this in (by hand, from an industry preset,
or from an uploaded PDF) — never writing code.
"""

from enum import StrEnum

from pydantic import BaseModel, Field


class RoutingMode(StrEnum):
    AI_FIRST = "AI_FIRST"
    AI_OVERFLOW = "AI_OVERFLOW"  # human rings first, AI after N seconds or when busy
    AI_AFTER_HOURS = "AI_AFTER_HOURS"
    HUMAN_FIRST = "HUMAN_FIRST"


class DayHours(BaseModel):
    day: str  # mon..sun
    open: str | None = "09:00"
    close: str | None = "17:00"
    closed: bool = False


class Service(BaseModel):
    name: str
    description: str = ""
    duration_minutes: int = 60
    price_from: float | None = None
    price_to: float | None = None
    price_note: str = ""  # e.g. "from", "per hour", "quote on site"
    bookable: bool = True


class Faq(BaseModel):
    question: str
    answer: str


class Policy(BaseModel):
    title: str
    body: str


class EscalationContact(BaseModel):
    name: str
    role: str = ""
    phone: str = ""
    email: str = ""
    whatsapp: str = ""
    receives: list[str] = Field(default_factory=lambda: ["urgent", "callback", "summary"])


class IntakeField(BaseModel):
    key: str
    label: str
    required: bool = True
    hint: str = ""


class FollowUp(BaseModel):
    enabled: bool = True
    days: list[int] = Field(default_factory=lambda: [2, 5, 10])
    channel: str = "sms"  # sms | whatsapp | email | same


class Compliance(BaseModel):
    disclose_ai: bool = True
    record_calls: bool = True
    recording_notice: str = "This call may be recorded for quality and training."
    region: str = "UK"  # UK | EU | US | CA | AU | other
    retention_days: int = 90
    no_advice_domains: list[str] = Field(default_factory=list)  # e.g. ["medical", "legal"]


class VoiceConfig(BaseModel):
    provider: str = "11labs"
    voice_id: str = "sarah"
    language: str = "en-GB"
    speed: float = 1.0
    background_sound: str = "office"
    first_message_mode: str = "assistant-speaks-first"


class BusinessProfile(BaseModel):
    business_name: str = "Acme Services"
    industry: str = "generic"
    description: str = ""
    website: str = ""
    address: str = ""
    timezone: str = "Europe/London"
    currency: str = "GBP"

    assistant_name: str = "Ava"
    assistant_role: str = "receptionist"
    tone: str = "warm, friendly, concise and professional"
    greeting: str = "Hi, thanks for calling {business_name}. I'm {assistant_name}, the AI assistant. How can I help today?"
    after_hours_greeting: str = (
        "Hi, thanks for calling {business_name}. We're closed right now, but I'm {assistant_name}, "
        "the AI assistant, and I can help or take a message."
    )
    languages: list[str] = Field(default_factory=lambda: ["en"])
    voice: VoiceConfig = Field(default_factory=VoiceConfig)

    routing_mode: RoutingMode = RoutingMode.AI_FIRST
    overflow_ring_seconds: int = 20
    hours: list[DayHours] = Field(
        default_factory=lambda: [
            DayHours(day=d) for d in ("mon", "tue", "wed", "thu", "fri")
        ]
        + [DayHours(day="sat", closed=True), DayHours(day="sun", closed=True)]
    )

    services: list[Service] = Field(default_factory=list)
    service_area: list[str] = Field(default_factory=list)  # postcodes / ZIP prefixes / towns
    service_area_note: str = ""
    faqs: list[Faq] = Field(default_factory=list)
    policies: list[Policy] = Field(default_factory=list)
    never_say: list[str] = Field(default_factory=list)  # things the AI must never promise

    intake_fields: list[IntakeField] = Field(
        default_factory=lambda: [
            IntakeField(key="name", label="Full name"),
            IntakeField(key="phone", label="Best callback number"),
            IntakeField(key="reason", label="Reason for calling"),
        ]
    )
    emergency_keywords: list[str] = Field(default_factory=list)
    emergency_script: str = ""
    escalation: list[EscalationContact] = Field(default_factory=list)
    transfer_number: str = ""

    booking_enabled: bool = True
    booking_provider: str = "internal"  # internal | google | calcom | link
    booking_link: str = ""
    slot_minutes: int = 30

    followup: FollowUp = Field(default_factory=FollowUp)
    compliance: Compliance = Field(default_factory=Compliance)
    custom_instructions: str = ""
