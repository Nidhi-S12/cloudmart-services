import pytest


async def test_health(client):
    res = await client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "service": "product-service"}


async def test_list_products_empty(client):
    res = await client.get("/products/")
    assert res.status_code == 200
    assert res.json() == []


async def test_create_product(client):
    payload = {
        "name": "Wireless Mouse",
        "description": "Ergonomic wireless mouse",
        "price": 25.50,
        "stock": 100,
        "category": "Electronics",
    }
    res = await client.post("/products/", json=payload)
    assert res.status_code == 201
    body = res.json()
    assert body["name"] == "Wireless Mouse"
    # Numeric columns serialize as strings in JSON to preserve decimal precision
    assert float(body["price"]) == 25.50
    assert body["id"] is not None


async def test_get_product_by_id(client):
    created = await client.post(
        "/products/",
        json={"name": "Keyboard", "price": 50, "stock": 10, "category": "Electronics"},
    )
    product_id = created.json()["id"]

    res = await client.get(f"/products/{product_id}")
    assert res.status_code == 200
    assert res.json()["name"] == "Keyboard"


async def test_get_product_not_found(client):
    res = await client.get("/products/99999")
    assert res.status_code == 404


async def test_update_product(client):
    created = await client.post(
        "/products/",
        json={"name": "Old", "price": 10, "stock": 5},
    )
    product_id = created.json()["id"]

    res = await client.put(f"/products/{product_id}", json={"name": "New", "price": 15})
    assert res.status_code == 200
    body = res.json()
    assert body["name"] == "New"
    assert float(body["price"]) == 15
    assert body["stock"] == 5  # unchanged fields preserved


async def test_delete_product(client):
    created = await client.post(
        "/products/",
        json={"name": "Deleteme", "price": 1, "stock": 1},
    )
    product_id = created.json()["id"]

    res = await client.delete(f"/products/{product_id}")
    assert res.status_code == 204

    followup = await client.get(f"/products/{product_id}")
    assert followup.status_code == 404


async def test_list_products_filter_by_category(client):
    await client.post("/products/", json={"name": "A", "price": 1, "stock": 1, "category": "Books"})
    await client.post("/products/", json={"name": "B", "price": 1, "stock": 1, "category": "Toys"})
    await client.post("/products/", json={"name": "C", "price": 1, "stock": 1, "category": "Books"})

    res = await client.get("/products/?category=Books")
    assert res.status_code == 200
    names = [p["name"] for p in res.json()]
    assert set(names) == {"A", "C"}


async def test_list_categories(client):
    await client.post("/products/", json={"name": "A", "price": 1, "stock": 1, "category": "Books"})
    await client.post("/products/", json={"name": "B", "price": 1, "stock": 1, "category": "Toys"})

    res = await client.get("/products/categories")
    assert res.status_code == 200
    assert set(res.json()) == {"Books", "Toys"}
