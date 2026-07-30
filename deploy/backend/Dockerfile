# syntax=docker/dockerfile:1.7
# Backend Dockerfile for radar-chart-rendering
# Multi-stage build: development -> production

# Mirror ARGs default to empty = official sources. Coolify (overseas) passes
# nothing and hits official PyPI; local China dev passes the mirror via
# docker-compose.dev.yml build.args.

# ============================================
# Stage 1: Base image with uv installer
# ============================================
FROM python:3.11-slim AS base

ARG PIP_INDEX=

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv (fast Python package manager) via pip.
# Use PIP_INDEX (China mirror) only when provided; empty = official PyPI.
# Cache mount reuses pip's wheel cache across rebuilds.
RUN --mount=type=cache,target=/root/.cache/pip \
    if [ -n "$PIP_INDEX" ]; then \
      pip install uv -i "$PIP_INDEX"; \
    else \
      pip install uv; \
    fi

# Set working directory
WORKDIR /app

# ============================================
# Stage 2: Development stage (with dev tools)
# ============================================
FROM base AS development

ARG PIP_INDEX=

# Copy dependency files
COPY pyproject.toml .

# Install all dependencies (including dev/test extras).
# Use PIP_INDEX (China mirror) only when provided; empty = official PyPI.
# Cache mounts on pip + uv avoid re-downloading wheels across rebuilds.
RUN --mount=type=cache,target=/root/.cache/pip \
    --mount=type=cache,target=/root/.cache/uv \
    if [ -n "$PIP_INDEX" ]; then \
      uv pip install --system -e ".[test,dev]" --index-url "$PIP_INDEX"; \
    else \
      uv pip install --system -e ".[test,dev]"; \
    fi

# Copy source code and alembic
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini .

# Development server runs on port 8000
EXPOSE 8000

# Run uvicorn with reload for development
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ============================================
# Stage 3: Builder (prepare production artifacts)
# ============================================
FROM base AS builder

ARG PIP_INDEX=

# Copy dependency files
COPY pyproject.toml .

# Install production dependencies only.
# Use PIP_INDEX (China mirror) only when provided; empty = official PyPI.
RUN --mount=type=cache,target=/root/.cache/pip \
    --mount=type=cache,target=/root/.cache/uv \
    if [ -n "$PIP_INDEX" ]; then \
      uv pip install --system -e "." --index-url "$PIP_INDEX"; \
    else \
      uv pip install --system -e "."; \
    fi

# Copy source code and alembic
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini .

# ============================================
# Stage 4: Production (minimal, non-root)
# ============================================
FROM python:3.11-slim AS production

# Install minimal runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd --gid 1000 appgroup \
    && useradd --uid 1000 --gid appgroup --shell /bin/bash --create-home appuser

# Set working directory
WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy source code and alembic from builder
COPY --from=builder --chown=appuser:appgroup /app/app ./app
COPY --from=builder --chown=appuser:appgroup /app/alembic ./alembic
COPY --from=builder --chown=appuser:appgroup /app/alembic.ini .

# Create storage directory for uploads/outputs
RUN mkdir -p /app/storage && chown -R appuser:appgroup /app/storage

# Pre-create the render_tmp mountpoint owned by appuser. The `render_tmp`
# named volume mounts at /app/public_assets/_render_tmp; Docker copies this
# directory's ownership into a fresh (empty) volume on first mount, so the
# non-root appuser can mkdir token subdirs during silhouette rewrite.
# Without this the volume is created root-owned and renders with uploaded
# silhouettes fail with PermissionError (silhouette_rewrite.py mkdir).
# (Dev backend runs as root via the `development` target, so it never hit this.)
RUN mkdir -p /app/public_assets/silhouettes /app/public_assets/music /app/public_assets/_render_tmp \
    && chown -R appuser:appgroup /app/public_assets

# Switch to non-root user
USER appuser

# Production server runs on port 8000
EXPOSE 8000

# Copy entrypoint script（位于 backend 构建上下文内，见 compose `context: ../backend`）
COPY --chown=appuser:appgroup entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Run entrypoint script (handles migrations before startup)
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
