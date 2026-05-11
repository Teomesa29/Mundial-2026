from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

class Settings(BaseSettings):
    # Base
    APP_NAME: str = "Mundial 2026 API"
    VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = False

    # Database (NeonDB)
    DATABASE_URL: str
    DATABASE_URL_SYNC: str
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 5
    DB_POOL_RECYCLE: int = 600   # 10 min — drop stale Neon connections faster

    # Security
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    # Football API
    FOOTBALL_API_KEY: str = ""
    FOOTBALL_API_URL: str = "https://api.football-data.org/v4"
    SYNC_INTERVAL_MINUTES: int = 5

    # CORS — stored as comma-separated string to avoid pydantic-settings JSON issues
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174"

    # Render
    PORT: int = 8000

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def allowed_origins_list(self) -> List[str]:
        """Parses ALLOWED_ORIGINS as a comma-separated or JSON-style string."""
        import json
        val = self.ALLOWED_ORIGINS.strip()
        if val.startswith("["):
            try:
                return json.loads(val)
            except Exception:
                pass
        return [o.strip() for o in val.split(",") if o.strip()]

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
