"""Reception Brain tools. Voice (Vapi), web chat and the simulator all call these same functions."""

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from dateutil import parser as dateparser
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Appointment, Call, CallEvent, Contact, Task
from app.schemas.profile import BusinessProfile
from app.services import booking, events, knowledge, notifications


@dataclass
class ToolContext:
    session: AsyncSession
    tenant_id: str
    profile: BusinessProfile
    call: Call
    state: dict[str, Any] = field(default_factory=dict)


def _fn(name: str, description: str, props: dict[str, Any], required: list[str] | None = None) -> dict[str, Any]:
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {"type": "object", "properties": props, "required": required or []},
        },
    }


S = {"type": "string"}

TOOL_SCHEMAS: list[dict[str, Any]] = [
    _fn("lookup_caller", "Look up the caller by phone number to see if they are a known customer and their upcoming appointments.",
        {"phone": S}),
    _fn("search_knowledge", "Search the business's uploaded documents for an answer not covered in your instructions.",
        {"query": S}, ["query"]),
    _fn("check_service_area", "Check whether a postcode, ZIP or town is inside the service area.", {"location": S}, ["location"]),
    _fn("capture_lead", "Save or update the caller's details as soon as you know them.",
        {"name": S, "phone": S, "email": S, "address": S, "reason": S,
         "urgency": {"type": "string", "enum": ["low", "normal", "high", "emergency"]},
         "details": {"type": "object", "description": "Any other intake fields, keyed by field key."}}),
    _fn("check_availability", "Find up to three open slots. date may be natural language like 'tomorrow' or 'next Friday'.",
        {"date": S, "service": S, "after_time": {"type": "string", "description": "HH:MM, optional"}}, ["date"]),
    _fn("book_appointment", "Book a slot returned by check_availability. Only confirm to the caller if success is true.",
        {"start_iso": S, "service": S, "name": S, "phone": S, "email": S, "notes": S}, ["start_iso", "name", "phone"]),
    _fn("reschedule_appointment", "Move the caller's existing appointment to a new start time.",
        {"phone": S, "new_start_iso": S}, ["phone", "new_start_iso"]),
    _fn("cancel_appointment", "Cancel the caller's next appointment.", {"phone": S, "reason": S}, ["phone"]),
    _fn("flag_emergency", "Alert the on-call team immediately about an urgent situation.",
        {"summary": S, "address": S}, ["summary"]),
    _fn("transfer_to_human", "Warm-transfer the call to staff with a one-line summary.",
        {"summary": S, "reason": S}, ["summary"]),
    _fn("send_sms_link", "Text the caller a link or written info (booking link, directions, prices).",
        {"phone": S, "message": S}, ["phone", "message"]),
    _fn("notify_staff", "Send an internal message, e.g. caller running late, callback request, message for a named person.",
        {"kind": {"type": "string", "enum": ["RUNNING_LATE", "CALLBACK", "MESSAGE", "COMPLAINT", "OTHER"]},
         "message": S, "for_person": S}, ["kind", "message"]),
    _fn("end_call", "End the call after summarising next steps.", {"reason": S}),
]

TOOL_NAMES = {t["function"]["name"] for t in TOOL_SCHEMAS}


def _norm_phone(p: str | None) -> str:
    if not p:
        return ""
    keep = "".join(ch for ch in p if ch.isdigit() or ch == "+")
    return keep


def parse_day(text: str, tz: str) -> date:
    today = datetime.now(ZoneInfo(tz)).date()
    t = (text or "").strip().lower()
    if t in ("", "today", "asap", "as soon as possible", "now"):
        return today
    if t == "tomorrow":
        return today + timedelta(days=1)
    names = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    for i, n in enumerate(names):
        if n in t:
            delta = (i - today.weekday()) % 7 or 7
            return today + timedelta(days=delta)
    try:
        return dateparser.parse(text, default=datetime.combine(today, datetime.min.time())).date()
    except (ValueError, OverflowError):
        return today


async def _contact(ctx: ToolContext, phone: str, create: bool = True) -> Contact | None:
    phone = _norm_phone(phone) or ctx.call.from_number
    if not phone:
        return None
    c = await ctx.session.scalar(select(Contact).where(Contact.tenant_id == ctx.tenant_id, Contact.phone == phone))
    if c is None and create:
        c = Contact(tenant_id=ctx.tenant_id, phone=phone)
        ctx.session.add(c)
        await ctx.session.flush()
    if c is not None and ctx.call.contact_id is None:
        ctx.call.contact_id = c.id
    return c


async def _task(ctx: ToolContext, kind: str, title: str, detail: str = "", priority: str = "normal") -> Task:
    t = Task(tenant_id=ctx.tenant_id, call_id=ctx.call.id, contact_id=ctx.call.contact_id, kind=kind,
             title=title, detail=detail, priority=priority)
    ctx.session.add(t)
    ctx.call.needs_attention = True
    await ctx.session.flush()
    events.publish(ctx.tenant_id, "task.created", {"id": t.id, "kind": kind, "title": title})
    return t


def _recipients(profile: BusinessProfile, kind: str) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for e in profile.escalation:
        if kind not in e.receives and "all" not in e.receives:
            continue
        if e.whatsapp:
            out.append(("whatsapp", e.whatsapp))
        elif e.phone:
            out.append(("sms", e.phone))
        if e.email:
            out.append(("email", e.email))
    return out


async def alert_staff(ctx: ToolContext, kind: str, body: str) -> int:
    n = 0
    for channel, to in _recipients(ctx.profile, kind):
        await notifications.send(ctx.session, ctx.tenant_id, channel, to, body, call_id=ctx.call.id)
        n += 1
    return n


async def run_tool(ctx: ToolContext, name: str, args: dict[str, Any]) -> dict[str, Any]:
    if name not in TOOL_NAMES:
        return {"success": False, "error": f"Unknown tool {name}"}
    try:
        result = await _HANDLERS[name](ctx, args or {})
    except booking.BookingError as exc:
        result = {"success": False, "error": str(exc)}
    except Exception as exc:  # noqa: BLE001 — tools must always return something speakable
        result = {
            "success": False,
            "error": "system_unavailable",
            "say": "I'm having trouble with our system right now. I'll take your details and have the team call you back.",
            "detail": str(exc)[:200],
        }
        await _task(ctx, "TECHNICAL_FAILURE", f"Tool {name} failed", str(exc)[:500], "high")
    ctx.session.add(CallEvent(tenant_id=ctx.tenant_id, call_id=ctx.call.id, kind=f"tool:{name}",
                              data={"args": args, "result": result}))
    await ctx.session.commit()
    events.publish(ctx.tenant_id, "call.tool", {"call_id": ctx.call.id, "tool": name, "success": result.get("success", True)})
    return result


# ---- handlers ---------------------------------------------------------------------------------


async def lookup_caller(ctx: ToolContext, a: dict[str, Any]) -> dict[str, Any]:
    c = await _contact(ctx, a.get("phone", ""), create=False)
    if c is None:
        return {"success": True, "known": False}
    upcoming = (await ctx.session.scalars(
        select(Appointment).where(Appointment.tenant_id == ctx.tenant_id, Appointment.contact_id == c.id,
                                  Appointment.status == "booked").order_by(Appointment.starts_at)
    )).all()
    tz = ctx.profile.timezone
    return {
        "success": True, "known": True, "name": c.name, "kind": c.kind,
        "upcoming": [{"service": x.service, "when": booking.Slot(x.starts_at, x.ends_at).label(tz), "start_iso": x.starts_at.isoformat()} for x in upcoming[:3]],
    }


async def search_knowledge(ctx: ToolContext, a: dict[str, Any]) -> dict[str, Any]:
    hits = await knowledge.search(ctx.session, ctx.tenant_id, a.get("query", ""))
    if not hits:
        return {"success": True, "found": False, "say": "I don't have that information to hand — I can take a message so the team can confirm."}
    return {"success": True, "found": True, "passages": hits}


async def check_service_area(ctx: ToolContext, a: dict[str, Any]) -> dict[str, Any]:
    loc = (a.get("location") or "").upper().replace(" ", "")
    area = ctx.profile.service_area
    if not area:
        return {"success": True, "covered": True, "note": "No service area restriction."}
    covered = any(loc.startswith(x.upper().replace(" ", "")) or x.upper().replace(" ", "") in loc for x in area)
    ctx.state["postcode"] = a.get("location")
    return {"success": True, "covered": covered, "note": ctx.profile.service_area_note}


async def capture_lead(ctx: ToolContext, a: dict[str, Any]) -> dict[str, Any]:
    c = await _contact(ctx, a.get("phone", ""))
    if c is None:
        return {"success": False, "error": "Need a phone number"}
    for key in ("name", "email", "address"):
        if a.get(key):
            setattr(c, key, a[key])
    extracted = dict(ctx.call.extracted or {})
    extracted.update({k: v for k, v in a.items() if v and k != "details"})
    extracted.update(a.get("details") or {})
    ctx.call.extracted = extracted
    if a.get("reason"):
        ctx.call.intent = ctx.call.intent or "ENQUIRY"
    if a.get("urgency"):
        ctx.call.urgency = a["urgency"]
    return {"success": True, "contact_id": c.id}


async def check_availability(ctx: ToolContext, a: dict[str, Any]) -> dict[str, Any]:
    p = ctx.profile
    if not p.booking_enabled:
        return {"success": False, "error": "Booking is not available by phone; offer a callback."}
    day = parse_day(a.get("date", ""), p.timezone)
    cal = await booking.get_calcom(ctx.session, ctx.tenant_id) if p.booking_provider == "calcom" else None
    slots: list[booking.Slot] = []
    for offset in range(0, 7):  # look ahead up to a week if the requested day is full/closed
        d = day + timedelta(days=offset)
        if cal:
            slots = await cal.availability(d, p.timezone)
        else:
            slots = await booking.internal_availability(ctx.session, ctx.tenant_id, p, d, a.get("service"),
                                                        after=a.get("after_time") if offset == 0 else None)
        if slots:
            break
    ctx.call.intent = "BOOKING"
    if not slots:
        return {"success": True, "slots": [], "say": "I can't see anything free in the next week — I'll ask the team to call you."}
    return {
        "success": True,
        "requested_day_available": slots[0].start.date() == day,
        "slots": [{"label": s.label(p.timezone), "start_iso": s.start.isoformat()} for s in slots],
    }


async def book_appointment(ctx: ToolContext, a: dict[str, Any]) -> dict[str, Any]:
    p = ctx.profile
    start = dateparser.isoparse(a["start_iso"])
    if start.tzinfo is None:
        start = start.replace(tzinfo=ZoneInfo(p.timezone))
    c = await _contact(ctx, a.get("phone", ""))
    if c and a.get("name"):
        c.name = a["name"]
    if c and a.get("email"):
        c.email = a["email"]
    external = ""
    cal = await booking.get_calcom(ctx.session, ctx.tenant_id) if p.booking_provider == "calcom" else None
    if cal:
        external = await cal.book(start, a.get("name", ""), a.get("email", ""), c.phone if c else "", p.timezone)
    appt = await booking.book_internal(ctx.session, ctx.tenant_id, p, start, a.get("service"),
                                       c.id if c else None, ctx.call.id, a.get("notes", ""))
    appt.external_ref = external
    ctx.call.outcome = "BOOKED"
    when = booking.Slot(appt.starts_at, appt.ends_at).label(p.timezone)
    if c:
        await notifications.send(
            ctx.session, ctx.tenant_id, "sms", c.phone,
            f"Hi {a.get('name', '').split(' ')[0] or 'there'}, you're booked with {p.business_name} for {appt.service} on {when}. "
            f"Reply or call us to change it.", call_id=ctx.call.id)
    await alert_staff(ctx, "summary", f"New booking: {a.get('name')} — {appt.service} on {when}. Phone {c.phone if c else ''}")
    return {"success": True, "appointment_id": appt.id, "when": when, "confirmation_sms": bool(c)}


async def _next_appt(ctx: ToolContext, phone: str) -> Appointment | None:
    c = await _contact(ctx, phone, create=False)
    if c is None:
        return None
    return await ctx.session.scalar(
        select(Appointment).where(Appointment.tenant_id == ctx.tenant_id, Appointment.contact_id == c.id,
                                  Appointment.status == "booked").order_by(Appointment.starts_at).limit(1))


async def reschedule_appointment(ctx: ToolContext, a: dict[str, Any]) -> dict[str, Any]:
    appt = await _next_appt(ctx, a.get("phone", ""))
    if appt is None:
        return {"success": False, "error": "No upcoming appointment found for that number."}
    p = ctx.profile
    new_start = dateparser.isoparse(a["new_start_iso"])
    if new_start.tzinfo is None:
        new_start = new_start.replace(tzinfo=ZoneInfo(p.timezone))
    appt.status = "cancelled"
    await ctx.session.flush()
    try:
        new = await booking.book_internal(ctx.session, ctx.tenant_id, p, new_start, appt.service, appt.contact_id, ctx.call.id, appt.notes)
    except booking.BookingError:
        appt.status = "booked"
        raise
    ctx.call.outcome = "RESCHEDULED"
    return {"success": True, "when": booking.Slot(new.starts_at, new.ends_at).label(p.timezone)}


async def cancel_appointment(ctx: ToolContext, a: dict[str, Any]) -> dict[str, Any]:
    appt = await _next_appt(ctx, a.get("phone", ""))
    if appt is None:
        return {"success": False, "error": "No upcoming appointment found for that number."}
    appt.status = "cancelled"
    appt.notes = f"{appt.notes}\nCancelled: {a.get('reason', '')}".strip()
    ctx.call.outcome = "CANCELLED"
    policy = next((x.body for x in ctx.profile.policies if "cancel" in x.title.lower()), "")
    return {"success": True, "cancelled": booking.Slot(appt.starts_at, appt.ends_at).label(ctx.profile.timezone), "policy": policy}


async def flag_emergency(ctx: ToolContext, a: dict[str, Any]) -> dict[str, Any]:
    ctx.call.urgency = "emergency"
    ctx.call.outcome = ctx.call.outcome or "EMERGENCY"
    body = f"URGENT call from {ctx.call.from_number}: {a.get('summary', '')} {a.get('address', '')}".strip()
    await _task(ctx, "URGENT", a.get("summary", "Emergency call"), body, "urgent")
    sent = await alert_staff(ctx, "urgent", body)
    return {"success": True, "alerted": sent}


async def transfer_to_human(ctx: ToolContext, a: dict[str, Any]) -> dict[str, Any]:
    p = ctx.profile
    from app.services.hours import is_open

    target = p.transfer_number or next((e.phone for e in p.escalation if e.phone), "")
    if not target or not is_open(p, datetime.now(ZoneInfo(p.timezone))):
        await _task(ctx, "CALLBACK_REQUIRED", f"Callback: {a.get('summary', '')}", a.get("reason", ""), "high")
        ctx.call.outcome = "CALLBACK_REQUIRED"
        return {"success": False, "transferred": False,
                "say": "Nobody's free to take the call right now, so I've asked the team to call you back as soon as possible."}
    ctx.call.outcome = "TRANSFERRED"
    ctx.state["transfer"] = {"number": target, "summary": a.get("summary", "")}
    return {"success": True, "transferred": True, "destination": target, "whisper": a.get("summary", "")}


async def send_sms_link(ctx: ToolContext, a: dict[str, Any]) -> dict[str, Any]:
    msg = a.get("message", "")
    if ctx.profile.booking_link and "{booking_link}" in msg:
        msg = msg.replace("{booking_link}", ctx.profile.booking_link)
    n = await notifications.send(ctx.session, ctx.tenant_id, "sms", _norm_phone(a.get("phone")) or ctx.call.from_number, msg, ctx.call.id)
    if n.status == "failed":
        await _task(ctx, "SMS_FAILED", "Text message failed", n.error, "high")
        return {"success": False, "say": "The text didn't go through — I'll make sure the team follows up."}
    return {"success": True, "status": n.status}


async def notify_staff(ctx: ToolContext, a: dict[str, Any]) -> dict[str, Any]:
    kind = a.get("kind", "MESSAGE")
    title = f"{kind.replace('_', ' ').title()}{' for ' + a['for_person'] if a.get('for_person') else ''}"
    await _task(ctx, kind if kind != "MESSAGE" else "STAFF_MESSAGE", title, a.get("message", ""),
                "high" if kind in ("RUNNING_LATE", "COMPLAINT") else "normal")
    sent = await alert_staff(ctx, "callback" if kind == "CALLBACK" else "urgent" if kind == "RUNNING_LATE" else "summary",
                             f"{title}: {a.get('message', '')} (caller {ctx.call.from_number})")
    if kind == "RUNNING_LATE":
        ctx.call.outcome = ctx.call.outcome or "PATIENT_RUNNING_LATE"
    elif not ctx.call.outcome:
        ctx.call.outcome = "MESSAGE_TAKEN"
    return {"success": True, "notified": sent}


async def end_call(ctx: ToolContext, a: dict[str, Any]) -> dict[str, Any]:
    ctx.state["ended"] = a.get("reason", "completed")
    return {"success": True}


_HANDLERS = {
    "lookup_caller": lookup_caller,
    "search_knowledge": search_knowledge,
    "check_service_area": check_service_area,
    "capture_lead": capture_lead,
    "check_availability": check_availability,
    "book_appointment": book_appointment,
    "reschedule_appointment": reschedule_appointment,
    "cancel_appointment": cancel_appointment,
    "flag_emergency": flag_emergency,
    "transfer_to_human": transfer_to_human,
    "send_sms_link": send_sms_link,
    "notify_staff": notify_staff,
    "end_call": end_call,
}
