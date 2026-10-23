"""Call lifecycle: start (tenant resolution, screening) and finish (summary, outcome, notifications, webhooks)."""

from datetime import timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ids import utcnow
from app.models import Call, Contact, Notification, PhoneNumber, Task
from app.schemas.profile import BusinessProfile
from app.services import events, llm, notifications, profiles, screening, webhooks
from app.services.hours import is_open

OUTCOMES = [
    "BOOKED", "RESCHEDULED", "CANCELLED", "FAQ_RESOLVED", "MESSAGE_TAKEN", "TRANSFERRED", "CALLBACK_REQUIRED",
    "EMERGENCY", "PATIENT_RUNNING_LATE", "UNCONVERTED", "SALES_CALL", "SPAM", "BLOCKED", "ABANDONED",
    "TECHNICAL_FAILURE",
]
NEEDS_ATTENTION = {"CALLBACK_REQUIRED", "EMERGENCY", "TECHNICAL_FAILURE", "UNCONVERTED", "PATIENT_RUNNING_LATE"}


async def resolve_tenant(session: AsyncSession, to_number: str) -> str | None:
    digits = "".join(ch for ch in to_number if ch.isdigit())
    rows = (await session.scalars(select(PhoneNumber).where(PhoneNumber.active))).all()
    for r in rows:
        if "".join(ch for ch in r.e164 if ch.isdigit()) == digits:
            return r.tenant_id
    return None


async def start_call(
    session: AsyncSession, tenant_id: str, *, from_number: str, to_number: str = "", provider: str = "sim",
    provider_call_id: str = "", channel: str = "phone",
) -> tuple[Call, BusinessProfile, dict[str, Any]]:
    profile, version = await profiles.get_live(session, tenant_id)
    existing = None
    if provider_call_id:
        existing = await session.scalar(select(Call).where(Call.tenant_id == tenant_id, Call.provider_call_id == provider_call_id))
    if existing:
        return existing, profile, {}
    contact = None
    if from_number:
        contact = await session.scalar(select(Contact).where(Contact.tenant_id == tenant_id, Contact.phone == from_number))
    repeat = await screening.recent_call_count(session, tenant_id, from_number) if from_number else 0
    call = Call(
        tenant_id=tenant_id, provider=provider, provider_call_id=provider_call_id, channel=channel,
        from_number=from_number, to_number=to_number, contact_id=contact.id if contact else None,
        after_hours=not is_open(profile, utcnow()), profile_version=version,
    )
    session.add(call)
    await session.commit()
    events.publish(tenant_id, "call.started", {"id": call.id, "from": from_number, "channel": channel})
    info = {
        "known_caller": bool(contact and contact.name),
        "caller_name": contact.name if contact else "",
        "blocked": bool(contact and contact.blocked),
        "repeat_calls_10m": repeat,
    }
    return call, profile, info


def _transcript_text(transcript: list[dict[str, Any]]) -> str:
    return "\n".join(f"{t.get('role', '?')}: {t.get('text', '')}" for t in transcript)


SUMMARY_SYSTEM = """You review a receptionist phone call. Return JSON:
{"summary": "<=2 sentences, plain English, what the caller wanted and what happens next",
 "intent": one of [BOOKING, RESCHEDULE, CANCEL, FAQ, QUOTE, EMERGENCY, COMPLAINT, RUNNING_LATE, MESSAGE, SALES, OTHER],
 "outcome": one of %s,
 "urgency": one of [low, normal, high, emergency],
 "fields": {"name":..., "phone":..., "email":..., "address":..., "postcode":..., "reason":..., plus any other details given},
 "follow_up_needed": bool}
Only include facts stated in the call.""" % OUTCOMES


def _heuristic_summary(call: Call, text: str) -> dict[str, Any]:
    lower = text.lower()
    outcome = call.outcome
    if not outcome:
        if screening.sales_score(lower) >= 0.5:
            outcome = "SALES_CALL"
        elif len([t for t in call.transcript if t.get("role") == "user"]) == 0:
            outcome = "ABANDONED"
        elif call.extracted.get("phone") or call.extracted.get("name"):
            outcome = "UNCONVERTED"
        else:
            outcome = "FAQ_RESOLVED"
    first_user = next((t.get("text", "") for t in call.transcript if t.get("role") == "user"), "")
    name = call.extracted.get("name") or "The caller"
    summary = f"{name} called about: {first_user[:140]}".strip() if first_user else "Caller hung up before speaking."
    return {"summary": summary, "intent": call.intent or "OTHER", "outcome": outcome, "urgency": call.urgency,
            "fields": dict(call.extracted), "follow_up_needed": outcome in NEEDS_ATTENTION}


async def finish_call(
    session: AsyncSession, call: Call, *, transcript: list[dict[str, Any]] | None = None, recording_url: str = "",
    duration_seconds: int | None = None, cost_usd: float | None = None, ended_reason: str = "",
) -> Call:
    profile, _ = await profiles.get_live(session, call.tenant_id)
    if transcript is not None:
        call.transcript = transcript
    call.recording_url = recording_url or call.recording_url
    call.status = "ended"
    call.ended_at = utcnow()
    if duration_seconds is not None:
        call.duration_seconds = duration_seconds
    elif call.started_at:
        started = call.started_at if call.started_at.tzinfo else call.started_at.replace(tzinfo=call.ended_at.tzinfo)
        call.duration_seconds = int((call.ended_at - started).total_seconds())
    if cost_usd is not None:
        call.cost_usd = cost_usd

    text = _transcript_text(call.transcript)
    result = None
    if text.strip():
        result = await llm.complete_json(SUMMARY_SYSTEM, text[:30000])
    if not result:
        result = _heuristic_summary(call, text)
    call.summary = result.get("summary", "")[:2000]
    call.intent = call.intent or result.get("intent", "OTHER")
    # a tool-confirmed outcome (e.g. BOOKED) beats the model's guess
    if not call.outcome:
        call.outcome = result.get("outcome") if result.get("outcome") in OUTCOMES else "UNCONVERTED"
    if result.get("urgency") == "emergency" or call.urgency == "emergency":
        call.urgency = "emergency"
    fields = {k: v for k, v in (result.get("fields") or {}).items() if v}
    call.extracted = {**fields, **(call.extracted or {})}

    contact = None
    if call.contact_id:
        contact = await session.get(Contact, call.contact_id)
    elif call.from_number:
        contact = await session.scalar(select(Contact).where(Contact.tenant_id == call.tenant_id, Contact.phone == call.from_number))
        if contact is None and call.outcome not in ("ABANDONED",):
            contact = Contact(tenant_id=call.tenant_id, phone=call.from_number)
            session.add(contact)
            await session.flush()
        if contact:
            call.contact_id = contact.id
    if contact:
        if not contact.name and call.extracted.get("name"):
            contact.name = str(call.extracted["name"])
        if not contact.email and call.extracted.get("email"):
            contact.email = str(call.extracted["email"])
        if call.outcome == "BOOKED" and contact.kind == "lead":
            contact.kind = "customer"
        score = screening.sales_score(text)
        if score or call.outcome in ("SALES_CALL", "SPAM"):
            screening.apply_spam_signal(contact, max(score, 0.5))

    if call.outcome in NEEDS_ATTENTION:
        call.needs_attention = True
        open_task = await session.scalar(select(Task).where(Task.call_id == call.id, Task.status == "open"))
        if open_task is None:
            session.add(Task(tenant_id=call.tenant_id, call_id=call.id, contact_id=call.contact_id,
                             kind=call.outcome, title=f"{call.outcome.replace('_', ' ').title()}: {call.extracted.get('name') or call.from_number}",
                             detail=call.summary, priority="urgent" if call.urgency == "emergency" else "high"))

    await _post_call_messages(session, call, profile, contact)
    await session.commit()
    payload = call_payload(call)
    await webhooks.dispatch(session, call.tenant_id, "call.ended", payload)
    await session.commit()
    events.publish(call.tenant_id, "call.ended", {"id": call.id, "outcome": call.outcome, "summary": call.summary})
    return call


async def _post_call_messages(session: AsyncSession, call: Call, profile: BusinessProfile, contact: Contact | None) -> None:
    if call.outcome in ("SALES_CALL", "SPAM", "BLOCKED"):
        return
    owner_body = (
        f"{profile.business_name} call — {call.outcome.replace('_', ' ').lower()}\n"
        f"From: {call.extracted.get('name') or 'Unknown'} {call.from_number}\n{call.summary}"
    )
    for e in profile.escalation:
        if "summary" in e.receives or "all" in e.receives:
            if e.whatsapp or e.phone:
                await notifications.send(session, call.tenant_id, "whatsapp" if e.whatsapp else "sms", e.whatsapp or e.phone, owner_body, call.id)
            if e.email:
                await notifications.send(session, call.tenant_id, "email", e.email, owner_body, call.id,
                                         subject=f"New call: {call.extracted.get('name') or call.from_number}")
    if not contact or not call.from_number:
        return
    if call.outcome == "ABANDONED" and profile.followup.enabled:
        # missed-call text-back
        await notifications.send(session, call.tenant_id, "sms", call.from_number,
                                 f"Hi, it's {profile.business_name} — sorry we missed you. How can we help? Reply here or call back anytime.", call.id)
    if call.outcome == "UNCONVERTED" and profile.followup.enabled:
        name = (contact.name or "").split(" ")[0] or "there"
        for day in profile.followup.days:
            session.add(Notification(
                tenant_id=call.tenant_id, call_id=call.id,
                channel=profile.followup.channel if profile.followup.channel != "same" else "sms", to=call.from_number,
                body=f"Hi {name}, it's {profile.assistant_name} from {profile.business_name}. Just checking in on your enquiry — "
                     f"would you like to go ahead or have any questions? Reply STOP to opt out.",
                status="queued", send_after=utcnow() + timedelta(days=day),
            ))


def call_payload(call: Call) -> dict[str, Any]:
    return {
        "id": call.id, "tenant_id": call.tenant_id, "channel": call.channel, "from": call.from_number, "to": call.to_number,
        "started_at": call.started_at, "ended_at": call.ended_at, "duration_seconds": call.duration_seconds,
        "outcome": call.outcome, "intent": call.intent, "urgency": call.urgency, "summary": call.summary,
        "extracted": call.extracted, "transcript": call.transcript, "recording_url": call.recording_url,
        "after_hours": call.after_hours, "profile_version": call.profile_version,
    }
