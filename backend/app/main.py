import asyncio
import contextlib
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, demo, knowledge, operations, settings, voice
from app.core.config import get_settings
from app.core.db import init_db
from app.services import followups


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    if get_settings().seed_demo:
        from app.seed import seed

        await seed()
    task = asyncio.create_task(followups.run_forever())
    yield
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(title=f"{s.app_name} API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in s.cors_origins.split(",") if o.strip()],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    for r in (auth.router, settings.router, knowledge.router, operations.router, voice.router, demo.router):
        app.include_router(r)

    @app.get("/health")
    async def health():
        return {"ok": True, "llm": s.llm_enabled, "voice_provider": s.voice_provider, "vapi": bool(s.vapi_api_key)}

    return app


app = create_app()
