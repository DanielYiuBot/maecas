from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    anthropic_api_key: str = ""
    google_api_key: str = ""
    llm_default_provider: str = "anthropic"
    llm_default_model: str = ""

    lseg_session_type: str = "platform"
    lseg_app_key: str = ""
    lseg_machine_id: str = ""
    lseg_password: str = ""

    log_level: str = "INFO"

    database_url: str = "sqlite+aiosqlite:///./maecas.db"
    cors_origins: list[str] = ["http://localhost:5173"]
    max_upload_size_mb: int = 10


settings = Settings()
