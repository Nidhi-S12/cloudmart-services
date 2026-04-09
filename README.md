# CloudMart Services

![api-gateway CI](https://github.com/Nidhi-S12/cloudmart-services/actions/workflows/api-gateway.yml/badge.svg)
![product-service CI](https://github.com/Nidhi-S12/cloudmart-services/actions/workflows/product-service.yml/badge.svg)
![order-service CI](https://github.com/Nidhi-S12/cloudmart-services/actions/workflows/order-service.yml/badge.svg)
![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?logo=fastapi&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-multi--stage-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)

Backend microservices monorepo for the CloudMart e-commerce platform. Three services — each independently containerised, CI-tested, and deployed to Kubernetes via GitOps.

---

## Repositories

| Repo | Purpose |
|------|---------|
| [cloudmart-gitops](https://github.com/Nidhi-S12/cloudmart-gitops) | Terraform, Helm values, K8s manifests, ArgoCD config |
| [cloudmart-services](https://github.com/Nidhi-S12/cloudmart-services) | This repo — backend microservices |
| [cloudmart-frontend](https://github.com/Nidhi-S12/cloudmart-frontend) | Next.js frontend |

---

## Services

| Service | Language | Port | Backing store |
|---------|----------|------|---------------|
| [api-gateway](#api-gateway) | Node.js / Express | 3000 | — |
| [product-service](#product-service) | Python / FastAPI | 8000 | RDS PostgreSQL |
| [order-service](#order-service) | Node.js / Express | 3001 | ElastiCache Redis + Kafka |

---

## Request & Response Flow

### Browsing products

```
Browser  GET https://tulunad.click/
    │
    ▼  (server-side render)
Next.js  GET http://api-gateway:3000/api/products?category=electronics
    │
    ▼
API Gateway  strips /api prefix  →  GET http://product-service:8000/products?category=electronics
    │
    ▼
Product Service  SELECT * FROM products WHERE category = 'electronics'  →  RDS PostgreSQL
    │
    ▼  JSON array of products
API Gateway  ──▶  Next.js  ──▶  HTML rendered  ──▶  Browser
```

### Placing an order

```
Browser  POST https://tulunad.click/api/orders
         body: { customerId: "user@gmail.com", items: [...] }
    │
    ▼
API Gateway  →  POST http://order-service:3001/orders
    │
    ▼
Order Service
    ├── generates UUID for order
    ├── calculates total
    ├── Promise.all([
    │     Redis SET order:<uuid>  JSON.stringify(order)  EX 86400   ← 24h TTL
    │     Kafka PRODUCE  topic: order.created  key: <uuid>  value: order
    │   ])
    └── returns 201 { id, customerId, items, total, status: "pending" }
    │
    ▼
Browser receives order confirmation
```

### Getting order history

```
Browser  GET https://tulunad.click/api/orders/customer/user@gmail.com
    │
    ▼
API Gateway  →  GET http://order-service:3001/orders/customer/user@gmail.com
    │
    ▼
Order Service  KEYS order:*  →  Redis  →  filters by customerId
    │
    ▼  JSON array of orders (from Redis, not DB — fast sub-millisecond reads)
Browser
```

## Service Architecture

```
                        ┌──────────────────────┐
                        │     API Gateway       │
                        │     (Node.js)         │
                        │     port 3000         │
                        │                       │
                        │  /api/products/* ─────┼──────────────────────┐
                        │  /api/orders/*   ─────┼──────────────────┐   │
                        └──────────────────────┘                  │   │
                                                                   │   │
                                    ┌──────────────────────────┐   │   │
                                    │      Order Service        │◀──┘   │
                                    │      (Node.js)            │       │
                                    │      port 3001            │       │
                                    │                           │       │
                                    │  POST /orders             │       │
                                    │   ├── stores in Redis ────┼──▶ ElastiCache
                                    │   └── publishes event ────┼──▶ Kafka
                                    │                           │       │
                                    │  GET /orders/:id          │       │
                                    │   └── reads from Redis    │       │
                                    └──────────────────────────┘       │
                                                                        │
                                    ┌──────────────────────────┐       │
                                    │   Product Service         │◀──────┘
                                    │   (Python / FastAPI)      │
                                    │   port 8000               │
                                    │                           │
                                    │  GET  /products           │
                                    │  GET  /products/:id  ─────┼──▶ RDS PostgreSQL
                                    │  POST /products           │
                                    │  GET  /products/categories│
                                    └──────────────────────────┘
```

---

## API Gateway

**Language:** Node.js / Express
**Port:** 3000

The single entry point for all API traffic from the frontend. It doesn't contain any business logic — it proxies requests to the appropriate backend service.

**Why a gateway?** The frontend doesn't need to know which service handles what. It talks to one URL (`/api/*`) and the gateway handles routing. This also means backend services can be refactored or replaced without touching the frontend.

### Routing

| Path | Proxied to |
|------|-----------|
| `/api/products/*` | `product-service:8000/products/*` |
| `/api/orders/*` | `order-service:3001/orders/*` |
| `/health` | Returns `{ status: "ok" }` |

### Environment Variables

| Variable | Description |
|----------|------------|
| `PRODUCT_SERVICE_URL` | Internal K8s URL for product-service (e.g. `http://product-service:8000`) |
| `ORDER_SERVICE_URL` | Internal K8s URL for order-service (e.g. `http://order-service:3001`) |

---

## Product Service

**Language:** Python / FastAPI
**Port:** 8000
**Database:** PostgreSQL (AWS RDS db.t3.micro)

Manages the product catalogue. Supports listing, filtering by category, searching, and individual product lookup.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/products` | List all products. Supports `?category=` and `?search=` query params |
| `GET` | `/products/categories` | List all distinct categories |
| `GET` | `/products/{id}` | Get a single product |
| `POST` | `/products` | Create a product |
| `PUT` | `/products/{id}` | Update a product |
| `DELETE` | `/products/{id}` | Delete a product |
| `GET` | `/health` | Liveness probe |

### Why FastAPI?

FastAPI gives automatic request validation (via Pydantic), auto-generated OpenAPI docs at `/docs`, and async SQLAlchemy for non-blocking database queries — all with minimal boilerplate.

### Environment Variables

| Variable | Source | Description |
|----------|--------|-------------|
| `DATABASE_URL` | AWS Secrets Manager → K8s Secret | PostgreSQL connection string |

---

## Order Service

**Language:** Node.js / Express
**Port:** 3001
**Backing stores:** ElastiCache Redis + Kafka (Strimzi)

Handles order creation. When an order is placed, two things happen in parallel:
1. The order is written to Redis with a 24-hour TTL
2. An `order.created` event is published to Kafka

### Why Redis for orders?

Orders in this system are transient — they represent the current session's cart and recent activity, not a long-term ledger. Redis is extremely fast for this use case and fits the read/write pattern (write once, read a few times, expire).

### Why Kafka for events?

Publishing to Kafka decouples the order-service from whatever needs to react to a new order (e.g. notifications, inventory updates, analytics). The order-service doesn't need to know or care about downstream consumers — it just publishes and moves on.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/orders` | Create an order. Body: `{ customerId, items: [{ productId, name, price, quantity }] }` |
| `GET` | `/orders/:id` | Retrieve an order by ID |
| `GET` | `/orders/customer/:customerId` | List all orders for a customer |
| `GET` | `/health` | Liveness probe |

### Environment Variables

| Variable | Source | Description |
|----------|--------|-------------|
| `REDIS_HOST` | AWS Secrets Manager → K8s Secret | ElastiCache Redis endpoint |
| `KAFKA_BROKERS` | AWS Secrets Manager → K8s Secret | Kafka bootstrap server address |

---

## CI Pipeline

Each service has its own GitHub Actions workflow that triggers on changes to that service's directory only. All 3 pipelines follow the same stages:

```
Push to main
    │
    ▼
1. Security Scans  (parallel)
   ├── Gitleaks   — scans git history for accidentally committed secrets
   ├── Semgrep    — SAST: OWASP Top 10, language-specific rules
   └── Trivy      — scans dependencies and filesystem for known CVEs
    │
    ▼
2. Build & Push  (only runs if security scans pass)
   ├── docker build  (multi-stage — deps → build → minimal runtime)
   ├── docker push   → ghcr.io/nidhi-s12/cloudmart/<service>:sha-<7-char-sha>
   └── Trivy image scan  (scans the final pushed image)
    │
    ▼
3. Update GitOps
   ├── Clone cloudmart-gitops
   ├── kustomize edit set image  (updates the image tag)
   ├── git commit + git pull --rebase + git push
   └── ArgoCD picks up the change and deploys to EKS
```

**Why path-based triggers?** Each workflow only fires when its own service changes. A commit to `order-service/` won't rebuild `product-service`. This saves CI time and avoids unnecessary deployments.

**Why SHA tags?** Using `sha-abc1234` instead of `latest` makes every deployment traceable to a specific commit. Rolling back means setting the tag back to a previous SHA — no guessing what `latest` was.

---

## Repo Structure

```
cloudmart-services/
│
├── .github/workflows/
│   ├── api-gateway.yml
│   ├── product-service.yml
│   └── order-service.yml
│
├── api-gateway/
│   ├── src/
│   │   └── index.js          # Express app + proxy routes
│   ├── docker/Dockerfile     # Multi-stage Node.js image
│   └── package.json
│
├── product-service/
│   ├── src/
│   │   ├── main.py           # FastAPI app entry point
│   │   ├── models.py         # SQLAlchemy ORM models
│   │   ├── schemas.py        # Pydantic request/response schemas
│   │   ├── database.py       # Async SQLAlchemy engine + session
│   │   └── routers/
│   │       └── products.py   # All product endpoints
│   ├── docker/Dockerfile
│   └── requirements.txt
│
└── order-service/
    ├── src/
    │   ├── index.js          # Express app entry point + graceful shutdown
    │   ├── kafka.js          # Kafka producer (KafkaJS)
    │   ├── redis.js          # Redis client (ioredis)
    │   └── routes/
    │       └── orders.js     # Order endpoints
    ├── docker/Dockerfile
    └── package.json
```

---

## Local Development

### With Docker Compose

```bash
docker-compose up   # starts all services + postgres + redis + kafka
```

### Individual service

```bash
# product-service
cd product-service
pip install -r requirements.txt
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/cloudmart \
  uvicorn src.main:app --reload --port 8000

# api-gateway
cd api-gateway
npm install
PRODUCT_SERVICE_URL=http://localhost:8000 \
ORDER_SERVICE_URL=http://localhost:3001 \
  node src/index.js

# order-service
cd order-service
npm install
REDIS_HOST=localhost \
KAFKA_BROKERS=localhost:9092 \
  node src/index.js
```
