"""Booking adapters. Internal calendar works out of the box; Cal.com via API key; 'link' just texts a URL."""

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Appointment, Integration
from app.schemas.profile import BusinessProfile
from app.services.hours import DAYS


class BookingError(Exception):
    pass


@dataclass
class Slot:
    start: datetime
    end: datetime

    def label(self, tz: str) -> str:
        local = self.start.astimezone(ZoneInfo(tz))
        return local.strftime("%A %d %B at %-I:%M %p").replace(" 0", " ")


def _service_minutes(profile: BusinessProfile, service: str | None) -> int:
    if service:
        for s in profile.services:
            if s.name.lower() == service.lower() or service.lower() in s.name.lower():
                return s.duration_minutes
    return profile.slot_minutes


async def internal_availability(
    session: AsyncSession, tenant_id: str, profile: BusinessProfile, day: date, service: str | None, limit: int = 3,
    after: str | None = None,
) -> list[Slot]:
    tz = ZoneInfo(profile.timezone)
    hours = next((h for h in profile.hours if h.day == DAYS[day.weekday()]), None)
    if not hours or hours.closed or not hours.open or not hours.close:
        return []
    minutes = _service_minutes(profile, service)
    start = datetime.combine(day, datetime.strptime(hours.open, "%H:%M").time(), tz)
    close = datetime.combine(day, datetime.strptime(hours.close, "%H:%M").time(), tz)
    if after:
        start = max(start, datetime.combine(day, datetime.strptime(after, "%H:%M").time(), tz))
    now = datetime.now(tz) + timedelta(minutes=30)
    booked = (
        await session.scalars(
            select(Appointment).where(
                and_(
                    Appointment.tenant_id == tenant_id,
                    Appointment.status == "booked",
                    Appointment.starts_at < close,
                    Appointment.ends_at > start,
                )
            )
        )
    ).all()
    slots: list[Slot] = []
    cursor = start
    step = timedelta(minutes=profile.slot_minutes)
    while cursor + timedelta(minutes=minutes) <= close and len(slots) < limit:
        end = cursor + timedelta(minutes=minutes)
        clash = any(_overlap(cursor, end, a.starts_at, a.ends_at) for a in booked)
        if cursor >= now and not clash:
            slots.append(Slot(cursor, end))
        cursor += step
    return slots


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=ZoneInfo("UTC"))


def _overlap(a1: datetime, a2: datetime, b1: datetime, b2: datetime) -> bool:
    return _aware(a1) < _aware(b2) and _aware(b1) < _aware(a2)


async def book_internal(
    session: AsyncSession, tenant_id: str, profile: BusinessProfile, start: datetime, service: str | None,
    contact_id: str | None, call_id: str | None, notes: str = "",
) -> Appointment:
    minutes = _service_minutes(profile, service)
    end = start + timedelta(minutes=minutes)
    clash = await session.scalar(
        select(Appointment).where(
            Appointment.tenant_id == tenant_id,
            Appointment.status == "booked",
            Appointment.starts_at < end,
            Appointment.ends_at > start,
        )
    )
    if clash is not None:
        raise BookingError("That time was just taken. Please offer another slot.")
    appt = Appointment(
        tenant_id=tenant_id, contact_id=contact_id, call_id=call_id, service=service or "Appointment",
        starts_at=start, ends_at=end, notes=notes,
    )
    session.add(appt)
    await session.flush()
    return appt


class CalCom:
    """Cal.com v2 adapter. Integration.config = {event_type_id}, secrets = {api_key}."""

    base = "https://api.cal.com/v2"

    def __init__(self, integ: Integration):
        self.event_type_id = integ.config.get("event_type_id")
        self.headers = {"Authorization": f"Bearer {integ.secrets.get('api_key', '')}", "cal-api-version": "2024-09-04"}

    async def availability(self, day: date, tz: str, limit: int = 3) -> list[Slot]:
        params = {"eventTypeId": self.event_type_id, "start": day.isoformat(), "end": day.isoformat(), "timeZone": tz}
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get(f"{self.base}/slots", params=params, headers={**self.headers, "cal-api-version": "2024-09-04"})
            r.raise_for_status()
        out: list[Slot] = []
        for items in (r.json().get("data") or {}).values():
            for item in items:
                start = datetime.fromisoformat(item["start"])
                out.append(Slot(start, start + timedelta(minutes=30)))
        return out[:limit]

    async def book(self, start: datetime, name: str, email: str, phone: str, tz: str) -> str:
        body = {
            "start": start.isoformat(),
            "eventTypeId": self.event_type_id,
            "attendee": {"name": name, "email": email or "noemail@example.com", "timeZone": tz, "phoneNumber": phone},
        }
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.post(f"{self.base}/bookings", json=body, headers={**self.headers, "cal-api-version": "2024-08-13"})
            r.raise_for_status()
        return str(r.json().get("data", {}).get("uid", ""))


async def get_calcom(session: AsyncSession, tenant_id: str) -> CalCom | None:
    integ = await session.scalar(
        select(Integration).where(Integration.tenant_id == tenant_id, Integration.kind == "calcom", Integration.active)
    )
    return CalCom(integ) if integ else None
