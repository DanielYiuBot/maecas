from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text

from backend.settings import settings

engine = create_async_engine(settings.database_url, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _ensure_thesis_history_columns(conn)


async def _ensure_thesis_history_columns(conn) -> None:
    """SQLite create_all does not add new columns to existing local databases."""
    result = await conn.execute(text("PRAGMA table_info(thesis_history)"))
    existing = {row[1] for row in result.fetchall()}
    columns = {
        "falsifiers_json": "TEXT",
        "post_earnings_return_pct": "REAL",
        "post_earnings_window": "VARCHAR",
        "thesis_outcome": "VARCHAR",
        "outcome_rationale": "TEXT",
    }
    for name, ddl in columns.items():
        if name not in existing:
            await conn.execute(text(f"ALTER TABLE thesis_history ADD COLUMN {name} {ddl}"))


async def get_session() -> AsyncSession:
    async with async_session() as session:
        yield session
