from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/cloudmart"

    class Config:
        env_file = ".env"


settings = Settings()

# create_async_engine is non-blocking — queries don't block the event loop
engine = create_async_engine(
    settings.database_url,
    echo=False,       # set True to log all SQL (useful for debugging)
    pool_size=10,
    max_overflow=20,
)

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
