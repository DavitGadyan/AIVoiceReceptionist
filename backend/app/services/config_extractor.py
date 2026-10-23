"""Reads an uploaded policy/price-list PDF and proposes profile changes for human review."""

import re
from typing import Any

from app.core.config import get_settings
from app.schemas.profile import BusinessProfile
from app.services import llm

SYSTEM = """You extract a small business's receptionist configuration from a document.
Return JSON with only the keys you found real evidence for:
{"business_name": str, "description": str, "address": str, "website": str,
 "hours": [{"day": "mon".."sun", "open": "HH:MM", "close": "HH:MM", "closed": bool}],
 "services": [{"name": str, "description": str, "duration_minutes": int, "price_from": number|null, "price_to": number|null, "price_note": str}],
 "faqs": [{"question": str, "answer": str}],
 "policies": [{"title": str, "body": str}],
 "service_area": [str], "emergency_keywords": [str], "never_say": [str]}
Copy prices and policy wording faithfully. Never invent values. Omit keys with no evidence."""

_PRICE = re.compile(r"^(?P<name>[A-Za-z][^£$€\n]{2,80}?)\s*[-:–]\s*(?P<cur>[£$€])\s?(?P<amt>\d[\d,]*(?:\.\d{2})?)", re.M)
_POLICY = re.compile(r"^(?P<title>[A-Z][A-Za-z ]{2,40}(?:policy|Policy))\s*[:\n]\s*(?P<body>.+?)(?=\n\s*\n|\Z)", re.S | re.M)
_QA = re.compile(r"^Q[:.]\s*(?P<q>.+?)\n\s*A[:.]\s*(?P<a>.+?)(?=\n\s*Q[:.]|\n\s*\n|\Z)", re.S | re.M)


def heuristic_extract(text: str) -> dict[str, Any]:
    out: dict[str, Any] = {}
    services = [
        {"name": m["name"].strip(), "price_from": float(m["amt"].replace(",", "")), "duration_minutes": 60}
        for m in _PRICE.finditer(text)
    ]
    if services:
        out["services"] = services[:30]
    policies = [{"title": m["title"].strip(), "body": " ".join(m["body"].split())} for m in _POLICY.finditer(text)]
    if policies:
        out["policies"] = policies
    faqs = [{"question": " ".join(m["q"].split()), "answer": " ".join(m["a"].split())} for m in _QA.finditer(text)]
    if faqs:
        out["faqs"] = faqs
    return out


async def propose(text: str) -> dict[str, Any]:
    data = await llm.complete_json(SYSTEM, text[:60000], model=get_settings().openai_extract_model)
    if data is None:
        data = heuristic_extract(text)
    # validate field-by-field so one bad key never discards the rest
    clean: dict[str, Any] = {}
    fields = BusinessProfile.model_fields
    for key, value in data.items():
        if key not in fields:
            continue
        try:
            BusinessProfile.model_validate({key: value})
            clean[key] = value
        except Exception:  # noqa: BLE001
            continue
    return clean


def apply(profile: BusinessProfile, changes: dict[str, Any], accept: list[str], mode: str = "merge") -> BusinessProfile:
    """Apply accepted keys. List fields merge (dedupe by name/question/title) unless mode == 'replace'."""
    data = profile.model_dump(mode="json")
    ident = {"services": "name", "faqs": "question", "policies": "title", "hours": "day"}
    for key in accept:
        if key not in changes:
            continue
        new = changes[key]
        if isinstance(new, list) and isinstance(data.get(key), list) and mode == "merge":
            id_key = ident.get(key)
            if id_key:
                merged = {str(item.get(id_key)).lower(): item for item in data[key]}
                for item in new:
                    merged[str(item.get(id_key)).lower()] = item
                data[key] = list(merged.values())
            else:
                data[key] = list(dict.fromkeys([*data[key], *new]))
        else:
            data[key] = new
    return BusinessProfile.model_validate(data)
