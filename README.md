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

## Service Architecture

```mermaid
flowchart TD
    GW["api-gateway\nNode.js  :3000"]

    PS["product-service\nPython / FastAPI  :8000"]
    OS["order-service\nNode.js  :3001"]

    RDS[("RDS PostgreSQL\nproduct catalogue")]
    Redis[("ElastiCache Redis\norder store  24h TTL")]
    Kafka[("Kafka\ntopic: order.created")]

    GW -->|"/api/products/*"| PS
    GW -->|"/api/orders/*"| OS
    PS --> RDS
    OS --> Redis
    OS --> Kafka
```

---

## Request & Response Flows

### Browsing products

```mermaid
sequenceDiagram
    participant B as Browser
    participant FE as Next.js (SSR)
    participant GW as api-gateway
    participant PS as product-service
    participant DB as RDS PostgreSQL

    B->>FE: GET tulunad.click/?category=electronics
    FE->>GW: GET /api/products?category=electronics
    GW->>PS: GET /products?category=electronics
    PS->>DB: SELECT * FROM products WHERE category='electronics'
    DB-->>PS: rows
    PS-->>GW: JSON array
    GW-->>FE: JSON array
    FE-->>B: rendered HTML with products
```

### Placing an order

```mermaid
sequenceDiagram
    participant B as Browser
    participant GW as api-gateway
    participant OS as order-service
    participant R as Redis
    participant K as Kafka

    B->>GW: POST /api/orders {customerId, items}
    GW->>OS: POST /orders {customerId, items}
    OS->>OS: generate UUID, calculate total
    par store in Redis
        OS->>R: SET order:<uuid> JSON EX 86400
    and publish to Kafka
        OS->>K: PRODUCE order.created {order}
    end
    OS-->>GW: 201 {id, total, status: pending}
    GW-->>B: order confirmation
```

### Getting order history

```mermaid
sequenceDiagram
    participant B as Browser
    participant GW as api-gateway
    participant OS as order-service
    participant R as Redis

    B->>GW: GET /api/orders/customer/user@email.com
    GW->>OS: GET /orders/customer/user@email.com
    OS->>R: KEYS order:* → filter by customerId
    R-->>OS: matching order keys
    OS->>R: MGET all matching keys
    R-->>OS: JSON strings
    OS-->>GW: JSON array of orders
    GW-->>B: order history
```

---

## API Gateway

**Language:** Node.js / Express  **Port:** 3000

Single entry point for all API traffic from the frontend. No business logic — pure routing.

**Why a gateway?** The frontend talks to one URL (`/api/*`) regardless of which backend service handles it. Services can be refactored or replaced without touching the frontend.

| Path | Proxied to |
|------|-----------|
| `/api/products/*` | `product-service:8000/products/*` |
| `/api/orders/*` | `order-service:3001/orders/*` |
| `/health` | Returns `{ status: "ok" }` |

| Variable | Description |
|----------|------------|
| `PRODUCT_SERVICE_URL` | `http://product-service:8000` |
| `ORDER_SERVICE_URL` | `http://order-service:3001` |

---

## Product Service

**Language:** Python / FastAPI  **Port:** 8000  **DB:** RDS PostgreSQL (db.t3.micro)

Manages the product catalogue with category filtering and full-text search.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/products` | List all. Supports `?category=` and `?search=` |
| `GET` | `/products/categories` | All distinct categories |
| `GET` | `/products/{id}` | Single product |
| `POST` | `/products` | Create |
| `PUT` | `/products/{id}` | Update |
| `DELETE` | `/products/{id}` | Delete |
| `GET` | `/health` | Liveness probe |

**Why FastAPI?** Auto request validation (Pydantic), auto-generated OpenAPI docs at `/docs`, async SQLAlchemy for non-blocking DB queries.

| Variable | Source | Description |
|----------|--------|-------------|
| `DATABASE_URL` | AWS Secrets Manager | PostgreSQL asyncpg connection string |

---

## Order Service

**Language:** Node.js / Express  **Port:** 3001  **Stores:** Redis + Kafka

When an order is placed, two things happen in parallel — Redis write + Kafka publish. Both are fire-and-respond; if either fails, the request errors cleanly.

**Why Redis?** Orders are transient (24h TTL). Redis is sub-millisecond for this write-once, read-a-few-times pattern — no need for a persistent DB here.

**Why Kafka?** Decouples order-service from downstream consumers (notifications, inventory, analytics). Order-service publishes and moves on — it doesn't care who's listening.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/orders` | Create. Body: `{ customerId, items: [{productId, name, price, quantity}] }` |
| `GET` | `/orders/:id` | Get by ID |
| `GET` | `/orders/customer/:id` | All orders for a customer |
| `GET` | `/health` | Liveness probe |

| Variable | Source | Description |
|----------|--------|-------------|
| `REDIS_HOST` | AWS Secrets Manager | ElastiCache endpoint |
| `KAFKA_BROKERS` | AWS Secrets Manager | Kafka bootstrap address |

---

## CI Pipeline

```mermaid
flowchart TD
    Push["git push to main\n(only triggers if service path changed)"]

    subgraph Security["Security Scans  (parallel)"]
        GL["Gitleaks\nsecrets in git history"]
        SG["Semgrep\nSAST — OWASP Top 10"]
        TV1["Trivy\ndependency CVEs"]
    end

    subgraph Build["Build & Push"]
        Docker["docker build\nmulti-stage"]
        GHCR["push to GHCR\n:sha-abc1234"]
        TV2["Trivy\nimage scan"]
    end

    subgraph GitOps["Update GitOps"]
        KZ["kustomize edit set image"]
        GC["git commit + pull --rebase + push"]
        ACD["ArgoCD detects diff\ndeploys to EKS"]
    end

    Push --> Security
    Security -->|all pass| Build
    Docker --> GHCR --> TV2 --> GitOps
    KZ --> GC --> ACD
```

Each workflow only triggers on changes to its own service directory — a commit to `order-service/` won't rebuild `product-service`.

---

## Repo Structure

```
cloudmart-services/
├── .github/workflows/
│   ├── api-gateway.yml
│   ├── product-service.yml
│   └── order-service.yml
├── api-gateway/
│   ├── src/index.js          # Express app + proxy routes
│   └── docker/Dockerfile
├── product-service/
│   ├── src/
│   │   ├── main.py           # FastAPI entry point
│   │   ├── models.py         # SQLAlchemy models
│   │   ├── schemas.py        # Pydantic schemas
│   │   ├── database.py       # Async engine + session
│   │   └── routers/products.py
│   └── docker/Dockerfile
└── order-service/
    ├── src/
    │   ├── index.js          # Express entry point + graceful shutdown
    │   ├── kafka.js          # KafkaJS producer
    │   ├── redis.js          # ioredis client
    │   └── routes/orders.js
    └── docker/Dockerfile
```

---

## Local Development

```bash
# All services + postgres + redis + kafka
docker-compose up

# Individual services
cd product-service && pip install -r requirements.txt
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/cloudmart \
  uvicorn src.main:app --reload --port 8000

cd api-gateway && npm install
PRODUCT_SERVICE_URL=http://localhost:8000 ORDER_SERVICE_URL=http://localhost:3001 \
  node src/index.js

cd order-service && npm install
REDIS_HOST=localhost KAFKA_BROKERS=localhost:9092 node src/index.js
```
