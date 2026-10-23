from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    app_name: str = "Receptra"
    environment: str = "dev"
    database_url: str = "sqlite+aiosqlite:///./receptra.db"
    jwt_secret: str = "change-me-in-production"
    jwt_ttl_minutes: int = 60 * 24 * 7
    public_base_url: str = "http://localhost:8000"
    cors_origins: str = "http://localhost:3000"

    openai_api_key: str | None = None
    openai_chat_model: str = "gpt-4o-mini"
    openai_extract_model: str = "gpt-4o"
    openai_embed_model: str = "text-embedding-3-small"

    voice_provider: str = "vapi"
    vapi_api_key: str | None = None
    vapi_public_key: str | None = None
    vapi_webhook_secret: str | None = None

    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    twilio_from_number: str | None = None
    twilio_whatsapp_from: str | None = None

    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str | None = None

    seed_demo: bool = True

    @property
    def llm_enabled(self) -> bool:
        return bool(self.openai_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
