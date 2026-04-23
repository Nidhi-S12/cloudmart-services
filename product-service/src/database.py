from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/cloudmart"
    db_ssl: bool = False  # set DB_SSL=true when connecting to RDS

    class Config:
        env_file = ".env"


settings = Settings()

connect_args = {"ssl": "require"} if settings.db_ssl else {}

# Pool sizing applies to server-backed drivers (postgres). SQLite uses
# StaticPool and rejects these kwargs — tests override DATABASE_URL to sqlite.
engine_kwargs = {"echo": False, "connect_args": connect_args}
if "sqlite" not in settings.database_url:
    engine_kwargs["pool_size"] = 10
    engine_kwargs["max_overflow"] = 20

# create_async_engine is non-blocking — queries don't block the event loop
engine = create_async_engine(settings.database_url, **engine_kwargs)

# Session factory — we create one session per request, then close it
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,  # keep objects accessible after commit
)


class Base(DeclarativeBase):
    pass


# FastAPI dependency — yields a DB session for each request, always closes it
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
