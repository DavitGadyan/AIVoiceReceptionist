"""Signed outbound webhooks so Make / n8n / Zapier / CRMs receive every call."""

import hashlib
import hmac
import json
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Notification, WebhookEndpoint


def sign(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


async def dispatch(session: AsyncSession, tenant_id: str, event: str, payload: dict[str, Any]) -> int:
    endpoints = (
        await session.scalars(
            select(WebhookEndpoint).where(WebhookEndpoint.tenant_id == tenant_id, WebhookEndpoint.active)
        )
    ).all()
    sent = 0
    body = json.dumps({"event": event, "data": payload}, default=str).encode()
    async with httpx.AsyncClient(timeout=8) as client:
        for ep in endpoints:
            if event not in ep.events and "*" not in ep.events:
                continue
            log = Notification(tenant_id=tenant_id, channel="webhook", to=ep.url, body=event)
            session.add(log)
            try:
                r = await client.post(
                    ep.url, content=body,
                    headers={"content-type": "application/json", "x-receptra-signature": sign(ep.secret, body), "x-receptra-event": event},
                )
                log.status = "sent" if r.status_code < 400 else "failed"
                log.error = "" if r.status_code < 400 else f"HTTP {r.status_code}"
                sent += r.status_code < 400
            except httpx.HTTPError as exc:
                log.status, log.error = "failed", str(exc)[:300]
    await session.flush()
    return sent
