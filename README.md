# cloudmart-services

Backend services monorepo for the CloudMart e-commerce platform.

## Services

| Service | Language | Port | Description |
|---|---|---|---|
| api-gateway | Node.js | 3000 | Routes all external traffic to internal services |
| product-service | Python FastAPI | 8000 | Product catalogue CRUD — backed by PostgreSQL |
| order-service | Node.js | 3001 | Order processing — backed by Redis, publishes to Kafka |

## Local dev
```bash
docker-compose up   # starts all services + postgres + redis + kafka
```
