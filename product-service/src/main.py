from contextlib import asynccontextmanager
from fastapi import FastAPI
from .database import engine, Base
from .routers import products


@asynccontextmanager
async def lifespan(app: FastAPI):
    # On startup: create tables if they don't exist
    # In production we'd use Alembic migrations instead, but this is fine for local dev
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # On shutdown: close the connection pool
    await engine.dispose()


app = FastAPI(
    title="CloudMart Product Service",
    version="1.0.0",
    lifespan=lifespan,
)

app.include_router(products.router)


@app.get("/health")
async def health():
    # Kubernetes liveness + readiness probes call this endpoint
    return {"status": "ok", "service": "product-service"}
