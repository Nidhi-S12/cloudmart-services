"""Seed the database with product data from DummyJSON API."""
import asyncio
import json
import os
from urllib.request import urlopen, Request

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import text

# Re-use the same models/base so the table schema matches
from src.database import Base
from src.models import Product

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/cloudmart",
)

engine = create_async_engine(DATABASE_URL)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


def fetch_products():
    url = "https://dummyjson.com/products?limit=200&select=title,description,category,price,rating,stock,brand,images,thumbnail"
    req = Request(url, headers={"User-Agent": "CloudMart-Seed/1.0"})
    with urlopen(req) as resp:
        data = json.loads(resp.read())
    return data["products"]


async def seed():
    # Ensure tables exist (with new columns)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    raw = fetch_products()
    print(f"Fetched {len(raw)} products from DummyJSON")

    async with SessionLocal() as db:
        for item in raw:
            product = Product(
                name=item["title"],
                description=item["description"],
                price=item["price"],
                stock=item["stock"],
                category=item["category"],
                image_url=item["thumbnail"],
                rating=item.get("rating"),
                brand=item.get("brand", ""),
            )
            db.add(product)

        await db.commit()
        print(f"Inserted {len(raw)} products into database")


if __name__ == "__main__":
    asyncio.run(seed())
