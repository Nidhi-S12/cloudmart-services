import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from .database import engine, Base
from .routers import products


@asynccontextmanager
async def lifespan(app: FastAPI):
    # create_all only in development — production uses Alembic migrations
    if os.getenv("ENV", "development") == "development":
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    yield
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
