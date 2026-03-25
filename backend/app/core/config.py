from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application-wide configuration loaded from environment / .env file."""

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://betterssb:betterssb_dev@localhost:5432/betterssb"

    # Auth
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # External services
    OPENAI_API_KEY: str = ""
    RMP_AUTH_TOKEN: str = ""

    # Server
    CORS_ORIGINS: list[str] = ["chrome-extension://*"]

    model_config = {"env_file": ".env"}
