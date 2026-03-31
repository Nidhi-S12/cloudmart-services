from datetime import datetime
from pydantic import BaseModel, ConfigDict


# What the client sends when creating a product
class ProductCreate(BaseModel):
    name: str
    description: str | None = None
    price: float
    stock: int = 0


# What the client sends when updating a product (all fields optional)
class ProductUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    price: float | None = None
    stock: int | None = None


# What we send back in responses — includes DB-generated fields
class ProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)  # lets Pydantic read SQLAlchemy models

    id: int
    name: str
    description: str | None
    price: float
    stock: int
    created_at: datetime
    updated_at: datetime
