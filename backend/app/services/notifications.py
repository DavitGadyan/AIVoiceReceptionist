"""SMS / WhatsApp / email delivery. Without provider credentials messages are stored as 'simulated'."""

import asyncio
import smtplib
from email.message import EmailMessage

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import Notification


async def _twilio_send(to: str, body: str, whatsapp: bool) -> None:
    s = get_settings()
    sender = s.twilio_whatsapp_from if whatsapp else s.twilio_from_number
    if whatsapp:
        to, sender = f"whatsapp:{to}", f"whatsapp:{sender}"
    url = f"https://api.twilio.com/2010-04-01/Accounts/{s.twilio_account_sid}/Messages.json"
    async with httpx.AsyncClient(timeout=10, auth=(s.twilio_account_sid or "", s.twilio_auth_token or "")) as c:
        r = await c.post(url, data={"To": to, "From": sender, "Body": body})
        r.raise_for_status()


def _smtp_send(to: str, subject: str, body: str) -> None:
    s = get_settings()
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = s.smtp_from or s.smtp_user, to, subject
    msg.set_content(body)
    with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=10) as server:
        server.starttls()
        if s.smtp_user:
            server.login(s.smtp_user, s.smtp_password or "")
        server.send_message(msg)


async def send(
    session: AsyncSession, tenant_id: str, channel: str, to: str, body: str,
    call_id: str | None = None, subject: str = "Message from your AI receptionist",
) -> Notification:
    s = get_settings()
    n = Notification(tenant_id=tenant_id, call_id=call_id, channel=channel, to=to, body=body)
    session.add(n)
    try:
        if not to:
            n.status, n.error = "failed", "no recipient"
        elif channel in ("sms", "whatsapp"):
            configured = s.twilio_account_sid and (s.twilio_whatsapp_from if channel == "whatsapp" else s.twilio_from_number)
            if configured:
                await _twilio_send(to, body, channel == "whatsapp")
                n.status = "sent"
            else:
                n.status = "simulated"
        elif channel == "email":
            if s.smtp_host:
                await asyncio.to_thread(_smtp_send, to, subject, body)
                n.status = "sent"
            else:
                n.status = "simulated"
        else:
            n.status, n.error = "failed", f"unknown channel {channel}"
    except Exception as exc:  # noqa: BLE001 — a failed message must never break the call
        n.status, n.error = "failed", str(exc)[:500]
    await session.flush()
    return n
