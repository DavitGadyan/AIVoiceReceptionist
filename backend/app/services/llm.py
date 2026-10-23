"""Thin OpenAI wrapper. Every caller has a deterministic fallback so demo mode works without a key."""

import json
import math
from typing import Any

from app.core.config import get_settings

_client = None


def client():
    global _client
    s = get_settings()
    if not s.openai_api_key:
        return None
    if _client is None:
        from openai import AsyncOpenAI

        _client = AsyncOpenAI(api_key=s.openai_api_key)
    return _client


async def complete_json(system: str, user: str, model: str | None = None) -> dict[str, Any] | None:
    c = client()
    if c is None:
        return None
    resp = await c.chat.completions.create(
        model=model or get_settings().openai_chat_model,
        response_format={"type": "json_object"},
        temperature=0.2,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
    )
    try:
        return json.loads(resp.choices[0].message.content or "{}")
    except json.JSONDecodeError:
        return None


async def embed(texts: list[str]) -> list[list[float]] | None:
    c = client()
    if c is None or not texts:
        return None
    resp = await c.embeddings.create(model=get_settings().openai_embed_model, input=texts)
    return [d.embedding for d in resp.data]


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=False))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0
