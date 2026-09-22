from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

    PROJECT_NAME: str = "Blockchain Examination & Grievance Management System"
    API_V1_STR: str = "/api/v1"
    SERVER_HOST: str = "0.0.0.0"
    SERVER_PORT: int = 5000

    # Database
    DATABASE_URL: str = Field(
        default="sqlite:///./exam_blockchain.db",
        description="PostgreSQL or SQLite connection string"
    )

    # Security & JWT
    JWT_SECRET_KEY: str = Field(
        default="exam_blockchain_super_secret_jwt_key_2026_local_dev",
        description="Cryptographic secret key for signing JWT tokens"
    )
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173"
    ]

    # Hyperledger Fabric Blockchain Flag (Stage 6 integration)
    FABRIC_ENABLED: bool = False


settings = Settings()
