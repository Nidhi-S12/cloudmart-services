# -------------------------------------------------------
# Stage 1 — builder
# Install dependencies in an isolated layer
# We use the full Python image here because we may need
# compilers to build native packages (e.g. asyncpg)
# -------------------------------------------------------
FROM python:3.12-slim AS builder

WORKDIR /app

# Copy only requirements first — Docker caches this layer
# If requirements.txt hasn't changed, this whole layer is reused
# and pip install is skipped on the next build (much faster)
COPY requirements.txt .

RUN pip install --upgrade pip && \
    pip install --no-cache-dir --prefix=/install -r requirements.txt


# -------------------------------------------------------
# Stage 2 — runtime
# Start fresh from the same slim base
# Copy only the installed packages from stage 1
# -------------------------------------------------------
FROM python:3.12-slim AS runtime

WORKDIR /app

# Create a non-root user — running as root inside a container is a security risk
# If an attacker escapes the container they'd have root on the host
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser

# Copy installed packages from builder stage
COPY --from=builder /install /usr/local

# Copy application source and seed script
COPY src/ ./src/
COPY seed.py .

# Switch to non-root user
USER appuser

# Document the port (doesn't publish it — that's done at runtime)
EXPOSE 8000

# Start the FastAPI app with uvicorn
# --host 0.0.0.0 makes it reachable from outside the container
# --workers 1 is fine for k8s (scale via replicas, not workers)
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
