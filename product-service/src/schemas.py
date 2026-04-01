from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict


class ProductCreate(BaseModel):
    name: str
    description: str | None = None
    price: Decimal
    stock: int = 0
    category: str | None = None
    image_url: str | None = None
    rating: float | None = None
    brand: str | None = None


class ProductUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    price: Decimal | None = None
    stock: int | None = None
    category: str | None = None
    image_url: str | None = None
    rating: float | None = None
    brand: str | None = None


class ProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    price: Decimal
    stock: int
    category: str | None
    image_url: str | None
    rating: float | None
    brand: str | None
    created_at: datetime
    updated_at: datetime
