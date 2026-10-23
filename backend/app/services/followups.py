"""Background sender for scheduled follow-ups. Stops when the lead books, replies or opts out."""

import asyncio
import logging

from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.ids import utcnow
from app.models import Appointment, Contact, Notification
from app.services import notifications

log = logging.getLogger(__name__)


async def send_due() -> int:
    sent = 0
    async with SessionLocal() as session:
        due = (await session.scalars(
            select(Notification).where(Notification.status == "queued", Notification.send_after <= utcnow())
        )).all()
        for n in due:
            contact = await session.scalar(select(Contact).where(Contact.tenant_id == n.tenant_id, Contact.phone == n.to))
            booked = contact and await session.scalar(
                select(Appointment).where(Appointment.contact_id == contact.id, Appointment.status == "booked"))
            if (contact and (contact.blocked or "opted_out" in contact.tags)) or booked:
                n.status = "cancelled"
                continue
            delivered = await notifications.send(session, n.tenant_id, n.channel, n.to, n.body, n.call_id)
            n.status = "superseded"
            sent += delivered.status in ("sent", "simulated")
        await session.commit()
    return sent


async def run_forever(interval: int = 60) -> None:
    while True:
        try:
            await send_due()
        except Exception:  # noqa: BLE001
            log.exception("follow-up loop failed")
        await asyncio.sleep(interval)
