# -------------------------------------------------------
# Stage 1 — builder: install dependencies
# -------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first — Docker caches this layer
# npm install only reruns when package.json changes
COPY package*.json ./
RUN npm ci --only=production

# -------------------------------------------------------
# Stage 2 — runtime: lean final image
# -------------------------------------------------------
FROM node:20-alpine AS runtime

WORKDIR /app

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy only installed node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy source
COPY src/ ./src/
COPY package.json ./

# Switch to non-root user
USER appuser

EXPOSE 3001

# Use node directly (not npm start) — cleaner signal handling
# npm wraps node and can swallow SIGTERM, preventing graceful shutdown
CMD ["node", "src/index.js"]
