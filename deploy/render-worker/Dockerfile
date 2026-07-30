# syntax=docker/dockerfile:1.7
# Render Worker Dockerfile for radar-chart-rendering
# Remotion-based video rendering worker (HTTP service on port 3100)

# Mirror ARGs default to empty = official sources. Coolify (overseas) passes
# nothing and hits the global CDNs; local China dev passes the mirrors via
# docker-compose.dev.yml build.args.

# ============================================
# Stage 1: Base image with Node.js and Chromium
# ============================================
FROM node:20-alpine AS base

ARG ALPINE_MIRROR=

# Apply Alpine mirror only when provided; empty keeps the default global CDN.
RUN if [ -n "$ALPINE_MIRROR" ]; then \
      sed -i "s|dl-cdn.alpinelinux.org|$ALPINE_MIRROR|g" /etc/apk/repositories; \
    fi

# Install Chromium for Remotion rendering.
# setpriv: Remotion launches Chromium via `setpriv --pdeathsig`; BusyBox's setpriv
# lacks that flag, so install the real util-linux setpriv (lands in /usr/bin, ahead
# of BusyBox /bin in PATH).
# Cache mount reuses the apk package cache (~300MB chromium) across rebuilds.
RUN --mount=type=cache,target=/var/cache/apk \
    apk add \
    chromium \
    chromium-chromedriver \
    ffmpeg \
    fontconfig \
    font-noto \
    font-noto-cjk \
    setpriv

# Set Chromium path for Remotion
ENV CHROMIUM_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Set working directory
WORKDIR /app

# ============================================
# Stage 2: Development stage
# ============================================
FROM base AS development

ARG NPM_REGISTRY=

# Apply npm mirror only when provided; empty keeps the default registry.
RUN if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY"; fi

# Copy package files（context=仓库根，源在 frontend/ 子树）
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/.npmrc ./

# Install pnpm globally (more reliable than corepack on Alpine)
RUN --mount=type=cache,target=/root/.npm \
    npm install -g pnpm

# Install all dependencies (approve builds for native packages)
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile && pnpm approve-builds

# Copy source code (including remotion components).
# 不要用 COPY frontend/ .：会把宿主机 Windows pnpm 创建的绝对路径 symlink 死链
# (frontend/node_modules/.pnpm/.../node_modules/@remotion/bundler -> C:/Users/...)
# 盖进容器，顶替上方 pnpm install 生成的扁平真实产物，导致 ESM 解析崩溃 + restart 循环。
# 显式 COPY 仅源码目录，node_modules 完全由容器内 pnpm install 生成。
COPY frontend/src ./src
COPY frontend/styles ./styles
COPY frontend/public ./public
COPY frontend/render-worker ./render-worker
COPY frontend/tsconfig.json ./
COPY frontend/package.json ./

# Development server runs on port 3100
EXPOSE 3100

# Run render worker
CMD ["pnpm", "worker"]

# ============================================
# Stage 3: Builder (prepare for production)
# ============================================
FROM base AS builder

ARG NPM_REGISTRY=

# Apply npm mirror only when provided; empty keeps the default registry.
RUN if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY"; fi

# Copy package files（context=仓库根，源在 frontend/ 子树）
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/.npmrc ./

# Install pnpm globally (more reliable than corepack on Alpine)
RUN --mount=type=cache,target=/root/.npm \
    npm install -g pnpm

# Install dependencies for Remotion bundler
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Copy source code for bundling.
# The whole src/ is needed: remotion components import from src/lib/* and
# src/types/* (and tsconfig "@/*" path alias resolves to ./src/*).
COPY frontend/src ./src
COPY frontend/styles ./styles
COPY frontend/public ./public
COPY frontend/tsconfig.json ./
COPY frontend/package.json ./

# ============================================
# Stage 4: Production (minimal worker)
# ============================================
FROM node:20-alpine AS production

ARG ALPINE_MIRROR=
ARG NPM_REGISTRY=

# Apply Alpine mirror only when provided; empty keeps the default global CDN.
RUN if [ -n "$ALPINE_MIRROR" ]; then \
      sed -i "s|dl-cdn.alpinelinux.org|$ALPINE_MIRROR|g" /etc/apk/repositories; \
    fi

# Install minimal runtime dependencies for Remotion (chromromium is required —
# this worker performs all video rendering).
# setpriv: needed for Chromium launch (BusyBox setpriv lacks --pdeathsig).
# Cache mount reuses the chromium/ffmpeg package cache across rebuilds.
RUN --mount=type=cache,target=/var/cache/apk \
    apk add \
    chromium \
    ffmpeg \
    fontconfig \
    font-noto \
    font-noto-cjk \
    setpriv

# Apply npm mirror only when provided; empty keeps the default registry.
RUN if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY"; fi

# Set Chromium path for Remotion
ENV CHROMIUM_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NODE_ENV=production
ENV WORKER_PORT=3100

# Run as the preexisting `node` user (uid/gid 1000) that node:20-alpine ships.
# This MUST match the backend's appuser uid (1000): the worker writes rendered
# videos into the shared `backend_storage` volume at paths whose dirs the backend
# creates (FileService.outputs_dir mkdir, owner 1000, mode 0755). A non-matching
# uid (e.g. a `--system` appuser at uid 100) cannot write into those dirs → EACCES,
# so renders fail at the worker output-write step.
# Set working directory
WORKDIR /app

# Copy package files (.npmrc configures hoisting for self-contained node_modules)
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/.npmrc ./

# Install pnpm globally (more reliable than corepack on Alpine)
RUN --mount=type=cache,target=/root/.npm \
    npm install -g pnpm

# Install only production dependencies (need Remotion packages)
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod

# Copy entire render-worker package (server.mjs + local ESM deps).
# server.mjs imports ./render-cancellation.mjs and ./worker-auth.mjs; copying
# only server.mjs leaves production with ERR_MODULE_NOT_FOUND and crash-loop.
COPY --chown=node:node frontend/render-worker ./render-worker

# Copy source code needed for Remotion bundling (whole src/: components pull in
# src/lib/* and src/types/*, and tsconfig "@/*" alias resolves to ./src/*).
COPY --from=builder --chown=node:node /app/src ./src
COPY --from=builder --chown=node:node /app/styles ./styles
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/tsconfig.json ./

# Create output directory, plus a writable webpack cache dir (node_modules is
# root-owned; without this the node user hits EACCES on /app/node_modules/.cache
# and bundling can't be cached across renders).
RUN mkdir -p /app/output /app/node_modules/.cache \
    && chown -R node:node /app/output /app/node_modules/.cache

# Switch to non-root node user (uid 1000, matches backend appuser)
USER node

# Production server runs on port 3100
EXPOSE 3100

# Run render worker
CMD ["node", "render-worker/server.mjs"]
