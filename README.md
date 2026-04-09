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
    classDef app fill:#059669,stroke:#065f46,color:#fff
    classDef db fill:#7C3AED,stroke:#4c1d95,color:#fff

    GW["API Gateway\nNode.js"]:::app
    PS["Product Service\nPython / FastAPI"]:::app
    OS["Order Service\nNode.js"]:::app
    RDS[("RDS PostgreSQL\nproduct catalogue")]:::db
    Redis[("ElastiCache Redis\norder store")]:::db
    Kafka[("Kafka\nevent stream")]:::db

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
    participant FE as Next.js
    participant GW as API Gateway
    participant PS as Product Service
    participant DB as PostgreSQL

    B->>FE: GET /
    FE->>GW: GET /api/products
    GW->>PS: GET /products
    PS->>DB: SELECT products
    DB-->>PS: rows
    PS-->>GW: JSON
    GW-->>FE: JSON
    FE-->>B: rendered HTML
```

### Placing an order

```mermaid
sequenceDiagram
    participant B as Browser
    participant GW as API Gateway
    participant OS as Order Service
    participant R as Redis
    participant K as Kafka

    B->>GW: POST /api/orders
    GW->>OS: POST /orders
    OS->>OS: generate ID, calculate total
    par store order
        OS->>R: SET order:<id> EX 24h
    and publish event
        OS->>K: PRODUCE order.created
    end
    OS-->>GW: 201 created
    GW-->>B: order confirmation
```

### Getting order history

```mermaid
sequenceDiagram
    participant B as Browser
    participant GW as API Gateway
    participant OS as Order Service
    participant R as Redis

    B->>GW: GET /api/orders/customer/:id
    GW->>OS: GET /orders/customer/:id
    OS->>R: get all orders for customer
    R-->>OS: order data
    OS-->>GW: JSON array
    GW-->>B: order list
```

---

## API Gateway

**Language:** Node.js / Express  **Port:** 3000

Single entry point for all API traffic from the frontend. No business logic — pure routing.

**Why a gateway?** The frontend talks to one URL regardless of which backend service handles it. Services can be refactored or replaced without touching the frontend.

| Path | Proxied to |
|------|-----------|
| `/api/products/*` | `product-service/products/*` |
| `/api/orders/*` | `order-service/orders/*` |
| `/health` | Returns `{ status: "ok" }` |

| Variable | Description |
|----------|------------|
| `PRODUCT_SERVICE_URL` | Internal K8s DNS URL for product-service |
| `ORDER_SERVICE_URL` | Internal K8s DNS URL for order-service |

---

## Product Service

**Language:** Python / FastAPI  **Port:** 8000  **DB:** RDS PostgreSQL

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

When an order is placed, two things happen in parallel — Redis write + Kafka publish.

**Why Redis?** Orders are transient (24h TTL). Redis is sub-millisecond for this write-once, read-a-few-times pattern.

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
    classDef git fill:#24292e,stroke:#000,color:#fff
    classDef sec fill:#EF4444,stroke:#991b1b,color:#fff
    classDef build fill:#0EA5E9,stroke:#0369a1,color:#fff
    classDef cd fill:#EF7B4D,stroke:#9a3412,color:#fff

    Push["git push\ntriggers only on changed service path"]:::git

    subgraph Security["Security Scans — parallel"]
        GL["Gitleaks\nsecrets in git history"]:::sec
        SG["Semgrep\nSAST — OWASP Top 10"]:::sec
        TV1["Trivy\ndependency CVEs"]:::sec
    end

    subgraph Build["Build & Push"]
        Docker["docker build\nmulti-stage"]:::build
        GHCR["push to registry\ntagged with git SHA"]:::build
        TV2["Trivy\nimage scan"]:::sec
    end

    subgraph GitOps["Update GitOps"]
        KZ["kustomize edit set image"]:::cd
        GC["git commit + rebase + push"]:::cd
        ACD["ArgoCD deploys\nto Kubernetes"]:::cd
    end

    Push --> Security
    Security -->|all pass| Docker --> GHCR --> TV2 --> KZ --> GC --> ACD
```

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
