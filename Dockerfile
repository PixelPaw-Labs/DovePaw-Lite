# syntax=docker/dockerfile:1

# ─── Stage 1: builder ────────────────────────────────────────────────────────
# Builds the Next.js production bundle and installs ejson.
# Uses full bookworm (not slim) so native addons and optional deps resolve.
FROM node:24.14.0-bookworm AS builder
WORKDIR /app

# Install ejson via the .deb package (curl is available in bookworm)
ARG EJSON_VERSION=1.5.4
RUN curl -fsSL \
    "https://github.com/Shopify/ejson/releases/download/v${EJSON_VERSION}/ejson_${EJSON_VERSION}_linux_amd64.deb" \
    -o /tmp/ejson.deb \
    && dpkg -i /tmp/ejson.deb \
    && rm /tmp/ejson.deb

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Needed by lib/paths.ts and next.config.ts during the build phase
ENV DOVEPAW_DATA_DIR=/data
ENV HOME=/root

RUN npm run chatbot:build

# ─── Stage 2: runtime ────────────────────────────────────────────────────────
FROM node:24.14.0-bookworm-slim AS runtime
WORKDIR /app

# apt-get upgrade patches base-image CVEs in packages shipped with bookworm-slim.
# libsecret-1-0 — @napi-rs/keyring runtime dep (falls back gracefully without D-Bus)
# git            — agent-sdk uses git worktree / clone
# ca-certificates — HTTPS calls from claude CLI
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends \
        libsecret-1-0 \
        git \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy ejson binary from builder — avoids installing curl in the runtime image
COPY --from=builder /usr/bin/ejson /usr/local/bin/ejson

# Re-run npm ci inside the linux/x64 container so platform-specific optional
# dependencies resolve correctly:
#   @anthropic-ai/claude-agent-sdk-linux-x64 (claude CLI binary)
#   @napi-rs/keyring-linux-x64-gnu
# Never copy node_modules from a macOS builder — the platform binaries differ.
COPY package.json package-lock.json ./
RUN npm ci

# Copy built Next.js output and all application source from builder.
# node_modules is intentionally excluded — we installed it above for linux/x64.
COPY --from=builder /app/chatbot ./chatbot
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/agent-local ./agent-local
COPY --from=builder /app/schemas ./schemas
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/scheduler-config ./scheduler-config
COPY --from=builder /app/.claude ./.claude
COPY --from=builder /app/docker ./docker
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/postcss.config.mjs ./
COPY --from=builder /app/components.json ./
COPY --from=builder /app/package.json ./

RUN chmod +x /app/docker/entrypoint.sh \
    && mkdir -p /data

ENV NODE_ENV=production
ENV HOME=/root
ENV SHELL=/bin/bash
ENV DOVEPAW_DATA_DIR=/data
ENV DOVEPAW_PORT=8473

EXPOSE 8473
ENTRYPOINT ["/app/docker/entrypoint.sh"]
