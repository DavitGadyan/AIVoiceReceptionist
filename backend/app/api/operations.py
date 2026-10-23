"""Calls, contacts, appointments, tasks, analytics, billing usage, numbers, integrations, webhooks."""

import asyncio
from datetime import timedelta
from typing import Any

import jwt
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func, select
from sse_starlette.sse import EventSourceResponse

from app.api.deps import Me, Session, owned
from app.core.config import get_settings
from app.core.ids import utcnow
from app.models import (
    Appointment, Call, CallEvent, Contact, Integration, Notification, PhoneNumber, Task, WebhookEndpoint,
)
from app.services import events
from app.services.calls import call_payload
from app.voice.base import get_provider

router = APIRouter(tags=["operations"])


def contact_dict(c: Contact) -> dict[str, Any]:
    return {"id": c.id, "name": c.name, "phone": c.phone, "email": c.email, "address": c.address, "kind": c.kind,
            "tags": c.tags, "blocked": c.blocked, "spam_score": c.spam_score, "notes": c.notes, "created_at": c.created_at}


def call_list_item(c: Call, contact: Contact | None) -> dict[str, Any]:
    return {"id": c.id, "channel": c.channel, "from": c.from_number, "status": c.status, "outcome": c.outcome,
            "intent": c.intent, "urgency": c.urgency, "summary": c.summary, "duration_seconds": c.duration_seconds,
            "after_hours": c.after_hours, "needs_attention": c.needs_attention, "started_at": c.started_at,
            "contact": contact_dict(contact) if contact else None}


# ---- calls ------------------------------------------------------------------------------------


@router.get("/calls")
async def list_calls(p: Me, session: Session, outcome: str | None = None, attention: bool | None = None,
                     q: str | None = None, limit: int = 50, offset: int = 0):
    stmt = select(Call, Contact).outerjoin(Contact, Contact.id == Call.contact_id).where(Call.tenant_id == p.tenant_id)
    if outcome:
        stmt = stmt.where(Call.outcome == outcome)
    if attention is not None:
        stmt = stmt.where(Call.needs_attention == attention)
    if q:
        like = f"%{q}%"
        stmt = stmt.where((Call.from_number.like(like)) | (Contact.name.like(like)) | (Call.summary.like(like)))
    total = await session.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = (await session.execute(stmt.order_by(Call.started_at.desc()).limit(min(limit, 200)).offset(offset))).all()
    return {"total": total, "items": [call_list_item(c, ct) for c, ct in rows]}


@router.get("/calls/stream")
async def stream(request: Request, token: str):
    """SSE for live dashboard updates. EventSource can't send headers, so the JWT comes as ?token=."""
    try:
        tenant_id = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])["tid"]
    except jwt.PyJWTError as exc:
        raise HTTPException(401, "Invalid token") from exc
    q = events.subscribe(tenant_id)

    async def gen():
        try:
            yield {"event": "ready", "data": "{}"}
            while not await request.is_disconnected():
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=15)
                    yield {"event": "message", "data": msg}
                except TimeoutError:
                    yield {"event": "ping", "data": "{}"}
        finally:
            events.unsubscribe(tenant_id, q)

    return EventSourceResponse(gen())


@router.get("/calls/{call_id}")
async def get_call(call_id: str, p: Me, session: Session):
    call = await owned(session, Call, call_id, p.tenant_id)
    contact = await session.get(Contact, call.contact_id) if call.contact_id else None
    evs = (await session.scalars(select(CallEvent).where(CallEvent.call_id == call.id).order_by(CallEvent.created_at))).all()
    history = []
    if contact:
        prev = (await session.scalars(select(Call).where(Call.tenant_id == p.tenant_id, Call.contact_id == contact.id,
                                                         Call.id != call.id).order_by(Call.started_at.desc()).limit(10))).all()
        history = [call_list_item(c, None) for c in prev]
    return {**call_payload(call), "needs_attention": call.needs_attention, "status": call.status,
            "contact": contact_dict(contact) if contact else None,
            "events": [{"kind": e.kind, "data": e.data, "at": e.created_at} for e in evs], "history": history}


# ---- contacts ---------------------------------------------------------------------------------


@router.get("/contacts")
async def list_contacts(p: Me, session: Session, q: str | None = None, kind: str | None = None, limit: int = 100):
    stmt = select(Contact).where(Contact.tenant_id == p.tenant_id)
    if q:
        stmt = stmt.where(Contact.name.like(f"%{q}%") | Contact.phone.like(f"%{q}%") | Contact.email.like(f"%{q}%"))
    if kind:
        stmt = stmt.where(Contact.kind == kind)
    rows = (await session.scalars(stmt.order_by(Contact.created_at.desc()).limit(min(limit, 500)))).all()
    counts = dict((await session.execute(
        select(Call.contact_id, func.count()).where(Call.tenant_id == p.tenant_id).group_by(Call.contact_id))).all())
    return [{**contact_dict(c), "calls": counts.get(c.id, 0)} for c in rows]


class ContactPatch(BaseModel):
    name: str | None = None
    email: str | None = None
    address: str | None = None
    kind: str | None = None
    tags: list[str] | None = None
    blocked: bool | None = None
    notes: str | None = None


@router.patch("/contacts/{contact_id}")
async def patch_contact(contact_id: str, body: ContactPatch, p: Me, session: Session):
    c = await owned(session, Contact, contact_id, p.tenant_id)
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(c, k, v)
    if body.kind and body.kind != "spam":
        c.spam_score = 0.0
    await session.commit()
    return contact_dict(c)


# ---- appointments & tasks ---------------------------------------------------------------------


@router.get("/appointments")
async def list_appointments(p: Me, session: Session, upcoming: bool = True):
    stmt = select(Appointment, Contact).outerjoin(Contact, Contact.id == Appointment.contact_id).where(
        Appointment.tenant_id == p.tenant_id)
    if upcoming:
        stmt = stmt.where(Appointment.starts_at >= utcnow() - timedelta(hours=2))
    rows = (await session.execute(stmt.order_by(Appointment.starts_at).limit(200))).all()
    return [{"id": a.id, "service": a.service, "starts_at": a.starts_at, "ends_at": a.ends_at, "status": a.status,
             "notes": a.notes, "contact": contact_dict(c) if c else None} for a, c in rows]


class StatusIn(BaseModel):
    status: str


@router.patch("/appointments/{appt_id}")
async def patch_appointment(appt_id: str, body: StatusIn, p: Me, session: Session):
    a = await owned(session, Appointment, appt_id, p.tenant_id)
    a.status = body.status
    await session.commit()
    return {"id": a.id, "status": a.status}


@router.get("/tasks")
async def list_tasks(p: Me, session: Session, status: str = "open"):
    rows = (await session.scalars(select(Task).where(Task.tenant_id == p.tenant_id, Task.status == status)
                                  .order_by(Task.created_at.desc()).limit(200))).all()
    return [{"id": t.id, "kind": t.kind, "title": t.title, "detail": t.detail, "priority": t.priority, "status": t.status,
             "call_id": t.call_id, "created_at": t.created_at} for t in rows]


@router.patch("/tasks/{task_id}")
async def patch_task(task_id: str, body: StatusIn, p: Me, session: Session):
    t = await owned(session, Task, task_id, p.tenant_id)
    t.status = body.status
    if body.status == "done" and t.call_id:
        call = await session.get(Call, t.call_id)
        remaining = await session.scalar(select(func.count()).select_from(Task).where(
            Task.call_id == t.call_id, Task.status == "open", Task.id != t.id))
        if call and not remaining:
            call.needs_attention = False
    await session.commit()
    return {"id": t.id, "status": t.status}


# ---- analytics & billing ----------------------------------------------------------------------


@router.get("/analytics/summary")
async def analytics(p: Me, session: Session, days: int = 30):
    since = utcnow() - timedelta(days=days)
    base = select(Call).where(Call.tenant_id == p.tenant_id, Call.started_at >= since)
    calls = (await session.scalars(base)).all()
    by_outcome: dict[str, int] = {}
    by_intent: dict[str, int] = {}
    by_day: dict[str, int] = {}
    by_hour = [0] * 24
    for c in calls:
        by_outcome[c.outcome or "LIVE"] = by_outcome.get(c.outcome or "LIVE", 0) + 1
        by_intent[c.intent or "OTHER"] = by_intent.get(c.intent or "OTHER", 0) + 1
        d = c.started_at.date().isoformat()
        by_day[d] = by_day.get(d, 0) + 1
        by_hour[c.started_at.hour] += 1
    total = len(calls)
    handled = sum(1 for c in calls if c.outcome not in ("TRANSFERRED", "CALLBACK_REQUIRED", "ABANDONED", "TECHNICAL_FAILURE", ""))
    booked = by_outcome.get("BOOKED", 0)
    leads = sum(1 for c in calls if c.outcome in ("BOOKED", "UNCONVERTED", "MESSAGE_TAKEN", "CALLBACK_REQUIRED"))
    minutes = sum(c.duration_seconds for c in calls) / 60
    open_tasks = await session.scalar(select(func.count()).select_from(Task).where(Task.tenant_id == p.tenant_id, Task.status == "open"))
    return {
        "days": days, "total_calls": total, "booked": booked, "after_hours": sum(c.after_hours for c in calls),
        "autonomous_rate": round(handled / total, 3) if total else 0, "conversion_rate": round(booked / leads, 3) if leads else 0,
        "avg_duration_seconds": round(sum(c.duration_seconds for c in calls) / total) if total else 0,
        "minutes": round(minutes, 1), "spam_blocked": by_outcome.get("SALES_CALL", 0) + by_outcome.get("SPAM", 0),
        "missed_recovered": by_outcome.get("ABANDONED", 0), "open_tasks": open_tasks,
        "by_outcome": by_outcome, "by_intent": by_intent,
        "by_day": [{"date": k, "calls": v} for k, v in sorted(by_day.items())], "by_hour": by_hour,
    }


# Rough blended rates for the usage estimate (Vapi platform + STT/TTS/LLM + Twilio). Override per plan.
RATE_PER_MIN = 0.13
RATE_SMS = 0.0083


@router.get("/billing/usage")
async def usage(p: Me, session: Session, days: int = 30):
    since = utcnow() - timedelta(days=days)
    secs = await session.scalar(select(func.coalesce(func.sum(Call.duration_seconds), 0)).where(
        Call.tenant_id == p.tenant_id, Call.started_at >= since)) or 0
    calls = await session.scalar(select(func.count()).select_from(Call).where(Call.tenant_id == p.tenant_id, Call.started_at >= since)) or 0
    msgs = await session.scalar(select(func.count()).select_from(Notification).where(
        Notification.tenant_id == p.tenant_id, Notification.created_at >= since,
        Notification.channel.in_(["sms", "whatsapp"]), Notification.status.in_(["sent", "simulated"]))) or 0
    transfers = await session.scalar(select(func.count()).select_from(Call).where(
        Call.tenant_id == p.tenant_id, Call.started_at >= since, Call.outcome == "TRANSFERRED")) or 0
    actual = await session.scalar(select(func.coalesce(func.sum(Call.cost_usd), 0.0)).where(
        Call.tenant_id == p.tenant_id, Call.started_at >= since)) or 0.0
    minutes = secs / 60
    est = round(minutes * RATE_PER_MIN + msgs * RATE_SMS, 2)
    return {"days": days, "calls": calls, "minutes": round(minutes, 1), "messages": msgs, "transfers": transfers,
            "estimated_cost_usd": est, "provider_reported_cost_usd": round(actual, 2),
            "rates": {"per_minute": RATE_PER_MIN, "per_sms": RATE_SMS},
            "projection": [{"minutes": m, "cost_usd": round(m * RATE_PER_MIN + 300 * RATE_SMS + 1.15, 2)} for m in (200, 500, 1000)]}


# ---- numbers, integrations, webhooks ---------------------------------------------------------


class NumberIn(BaseModel):
    e164: str
    label: str = "Main line"
    country: str = "GB"
    provider: str = "vapi"
    provider_ref: str = ""
    forwarding_mode: str = "dedicated"


@router.get("/numbers")
async def list_numbers(p: Me, session: Session):
    rows = (await session.scalars(select(PhoneNumber).where(PhoneNumber.tenant_id == p.tenant_id))).all()
    return [{"id": n.id, "e164": n.e164, "label": n.label, "country": n.country, "provider": n.provider,
             "provider_ref": n.provider_ref, "forwarding_mode": n.forwarding_mode, "active": n.active} for n in rows]


@router.post("/numbers")
async def add_number(body: NumberIn, p: Me, session: Session):
    if await session.scalar(select(PhoneNumber).where(PhoneNumber.e164 == body.e164)):
        raise HTTPException(409, "Number already in use")
    n = PhoneNumber(tenant_id=p.tenant_id, **body.model_dump())
    session.add(n)
    await session.commit()
    attach = await get_provider(n.provider).attach_number(n.provider_ref) if n.provider_ref else {"attached": False}
    return {"id": n.id, "attach": attach}


@router.delete("/numbers/{num_id}")
async def delete_number(num_id: str, p: Me, session: Session):
    n = await owned(session, PhoneNumber, num_id, p.tenant_id)
    await session.delete(n)
    await session.commit()
    return {"deleted": True}


class IntegrationIn(BaseModel):
    kind: str
    config: dict[str, Any] = {}
    secrets: dict[str, Any] = {}
    active: bool = True


@router.get("/integrations")
async def list_integrations(p: Me, session: Session):
    rows = (await session.scalars(select(Integration).where(Integration.tenant_id == p.tenant_id))).all()
    return [{"id": i.id, "kind": i.kind, "config": i.config, "has_secrets": bool(i.secrets), "active": i.active} for i in rows]


@router.put("/integrations")
async def upsert_integration(body: IntegrationIn, p: Me, session: Session):
    row = await session.scalar(select(Integration).where(Integration.tenant_id == p.tenant_id, Integration.kind == body.kind))
    if row is None:
        row = Integration(tenant_id=p.tenant_id, kind=body.kind)
        session.add(row)
    row.config, row.active = body.config, body.active
    if body.secrets:
        row.secrets = body.secrets
    await session.commit()
    return {"id": row.id}


class WebhookIn(BaseModel):
    url: str
    events: list[str] = ["call.ended"]


@router.get("/webhooks")
async def list_webhooks(p: Me, session: Session):
    rows = (await session.scalars(select(WebhookEndpoint).where(WebhookEndpoint.tenant_id == p.tenant_id))).all()
    return [{"id": w.id, "url": w.url, "events": w.events, "secret": w.secret, "active": w.active} for w in rows]


@router.post("/webhooks")
async def add_webhook(body: WebhookIn, p: Me, session: Session):
    w = WebhookEndpoint(tenant_id=p.tenant_id, url=body.url, events=body.events)
    session.add(w)
    await session.commit()
    return {"id": w.id, "secret": w.secret}


@router.delete("/webhooks/{wh_id}")
async def delete_webhook(wh_id: str, p: Me, session: Session):
    w = await owned(session, WebhookEndpoint, wh_id, p.tenant_id)
    await session.delete(w)
    await session.commit()
    return {"deleted": True}


# ---- contact creation & messaging (dashboard composer) ---------------------------------------


class ContactIn(BaseModel):
    name: str = ""
    phone: str
    email: str = ""
    address: str = ""
    kind: str = "lead"
    tags: list[str] = []
    notes: str = ""


@router.post("/contacts")
async def create_contact(body: ContactIn, p: Me, session: Session):
    phone = "".join(ch for ch in body.phone if ch.isdigit() or ch == "+")
    if len(phone) < 7:
        raise HTTPException(422, "Enter a valid phone number")
    if await session.scalar(select(Contact).where(Contact.tenant_id == p.tenant_id, Contact.phone == phone)):
        raise HTTPException(409, "A contact with that number already exists")
    c = Contact(tenant_id=p.tenant_id, **{**body.model_dump(), "phone": phone})
    session.add(c)
    await session.commit()
    return contact_dict(c)


class MessageIn(BaseModel):
    body: str
    channel: str = "sms"


@router.get("/contacts/{contact_id}/messages")
async def list_messages(contact_id: str, p: Me, session: Session):
    c = await owned(session, Contact, contact_id, p.tenant_id)
    rows = (await session.scalars(select(Notification).where(
        Notification.tenant_id == p.tenant_id, Notification.to == c.phone, Notification.channel.in_(["sms", "whatsapp"]),
        Notification.status.in_(["sent", "simulated", "failed"])).order_by(Notification.created_at.desc()).limit(50))).all()
    return [{"id": n.id, "channel": n.channel, "body": n.body, "status": n.status, "error": n.error, "call_id": n.call_id,
             "created_at": n.created_at} for n in reversed(rows)]


@router.post("/contacts/{contact_id}/messages")
async def send_message(contact_id: str, body: MessageIn, p: Me, session: Session):
    from app.services import notifications

    c = await owned(session, Contact, contact_id, p.tenant_id)
    if c.blocked:
        raise HTTPException(409, "This number is blocked")
    if body.channel not in ("sms", "whatsapp"):
        raise HTTPException(422, "channel must be sms or whatsapp")
    text = body.body.strip()
    if not text:
        raise HTTPException(422, "Message is empty")
    n = await notifications.send(session, p.tenant_id, body.channel, c.phone, text[:1600])
    await session.commit()
    return {"id": n.id, "channel": n.channel, "body": n.body, "status": n.status, "error": n.error, "created_at": n.created_at}
