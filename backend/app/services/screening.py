"""Spam / sales screening and repeat-caller detection with progressive blocking."""

import re
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ids import utcnow
from app.models import Call, Contact

SALES_PATTERNS = [
    r"\b(business )?(electricity|energy|gas) (contract|supplier|rates)\b",
    r"\b(seo|google ranking|rank(ing)? on google|website redesign)\b",
    r"\b(card processing|merchant services|payment terminal)\b",
    r"\bspeak to the (owner|business owner|decision maker)\b",
    r"\b(we help (clinics|businesses|companies))\b",
    r"\bextended (car )?warranty\b",
    r"\b(google (business|my business) (listing|profile) (is|has been) (suspended|unverified))\b",
]


def sales_score(text: str) -> float:
    text = text.lower()
    hits = sum(1 for p in SALES_PATTERNS if re.search(p, text))
    return min(1.0, hits * 0.5)


async def recent_call_count(session: AsyncSession, tenant_id: str, number: str, minutes: int = 10) -> int:
    since = utcnow() - timedelta(minutes=minutes)
    return await session.scalar(
        select(func.count()).select_from(Call).where(
            Call.tenant_id == tenant_id, Call.from_number == number, Call.started_at >= since
        )
    ) or 0


def apply_spam_signal(contact: Contact, score: float) -> None:
    """Low → allow, medium → flag, repeated high → block. Humans can always override."""
    contact.spam_score = round(min(1.0, contact.spam_score * 0.6 + score), 2)
    if score >= 0.5:
        contact.kind = "spam" if contact.kind in ("lead", "spam") else contact.kind
        if "sales" not in contact.tags:
            contact.tags = [*contact.tags, "sales"]
    if contact.spam_score >= 0.9 and contact.kind == "spam":
        contact.blocked = True
