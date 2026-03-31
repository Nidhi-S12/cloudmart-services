from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict


class ProductCreate(BaseModel):
    name: str
    description: str | None = None
    price: Decimal
    stock: int = 0


class ProductUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    price: Decimal | None = None
    stock: int | None = None


class ProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    price: Decimal  # matches Numeric(10,2) in DB — avoids float precision loss
    stock: int
    created_at: datetime
    updated_at: datetime
