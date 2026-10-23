import os
import tempfile

_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_db.name}"
os.environ["OPENAI_API_KEY"] = ""  # tests use the offline brain
os.environ["VAPI_WEBHOOK_SECRET"] = "test-secret"
os.environ["JWT_SECRET"] = "test-jwt-secret-that-is-long-enough-123"
os.environ["TWILIO_ACCOUNT_SID"] = ""

import httpx  # noqa: E402
import pytest  # noqa: E402

from app.core.db import init_db  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import seed  # noqa: E402

_ready = False


@pytest.fixture
async def client():
    global _ready
    if not _ready:
        await init_db()
        await seed()
        _ready = True
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def login(client, email="demo@receptra.ai"):
    r = await client.post("/auth/login", json={"email": email, "password": "demo1234"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture
async def auth(client):
    return await login(client)
