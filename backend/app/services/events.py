"""In-process pub/sub that feeds the dashboard's live SSE stream (swap for Redis in multi-instance deploys)."""

import asyncio
import json
from collections import defaultdict
from typing import Any

_subs: dict[str, set[asyncio.Queue[str]]] = defaultdict(set)


def publish(tenant_id: str, event: str, data: dict[str, Any]) -> None:
    msg = json.dumps({"event": event, "data": data}, default=str)
    for q in list(_subs[tenant_id]):
        if q.qsize() < 100:
            q.put_nowait(msg)


def subscribe(tenant_id: str) -> asyncio.Queue[str]:
    q: asyncio.Queue[str] = asyncio.Queue()
    _subs[tenant_id].add(q)
    return q


def unsubscribe(tenant_id: str, q: asyncio.Queue[str]) -> None:
    _subs[tenant_id].discard(q)
