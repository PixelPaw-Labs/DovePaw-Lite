# syntax=docker/dockerfile:1

# ─── Stage 1: builder ────────────────────────────────────────────────────────
# Installs deps and copies source. next build runs at container startup (entrypoint.sh)
# after /data/settings.agents/ is populated by setup.ts.
# Uses full bookworm (not slim) so native addons and optional deps resolve.
FROM node:24.15.0-bookworm AS builder
WORKDIR /app

# Install ejson via the .deb package (curl is available in bookworm).
# Optional: if the download fails (e.g. no network access to GitHub), a stub is created
# so the build succeeds with a warning. ejson features will be unavailable at runtime.
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

ARG EJSON_VERSION=1.5.4
RUN ARCH=$(dpkg --print-architecture) \
    && curl -fsSL \
    "https://github.com/Shopify/ejson/releases/download/v${EJSON_VERSION}/ejson_${EJSON_VERSION}_linux_${ARCH}.deb" \
    -o /tmp/ejson.deb \
    && dpkg -i /tmp/ejson.deb \
    && rm /tmp/ejson.deb \
    || { echo "WARNING: ejson installation failed — ejson will not be available in this image" \
         && printf '#!/bin/sh\necho "ejson not installed" >&2\nexit 1\n' > /usr/bin/ejson \
         && chmod +x /usr/bin/ejson; }

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .

# ─── Stage 2: runtime ────────────────────────────────────────────────────────
FROM node:24.15.0-bookworm-slim AS runtime
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
        cron \
    && rm -rf /var/lib/apt/lists/*

# Copy ejson binary from builder — either the real binary or the stub created on download failure
COPY --from=builder /usr/bin/ejson /usr/local/bin/ejson

# Re-run npm ci inside the linux container so platform-specific optional
# dependencies resolve correctly:
#   @anthropic-ai/claude-agent-sdk-linux-{arm64,x64} (claude CLI binary)
#   @napi-rs/keyring-linux-{arm64,x64}-gnu
# Never copy node_modules from a macOS builder — the platform binaries differ.
COPY package.json package-lock.json ./
# --ignore-scripts prevents the project's "install" lifecycle script from running at build time.
# Remove *-musl SDK packages after install: npm installs both glibc and musl variants on any
# Linux system (it only checks os/cpu, not libc). The SDK resolver tries musl first; on
# Debian (glibc) the musl binary's dynamic linker (/lib/ld-musl-*.so.1) is absent, causing
# "native binary not found" even though the file exists. Removing musl forces the SDK to
# use the glibc binary, which works correctly on bookworm-slim.
RUN npm ci --ignore-scripts && \
    rm -rf node_modules/@anthropic-ai/claude-agent-sdk-linux-arm64-musl \
           node_modules/@anthropic-ai/claude-agent-sdk-linux-x64-musl && \
    find node_modules/@anthropic-ai -name "claude" -type f -exec chmod +x {} \;

# Copy application source from builder.
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
COPY --from=builder /app/tsup.config.ts ./
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/postcss.config.mjs ./
COPY --from=builder /app/components.json ./
COPY --from=builder /app/package.json ./

COPY --from=builder /app/docker/claude-settings.json /root/.claude/settings.json
COPY --from=builder /app/.claude/output-styles/ /root/.claude/output-styles/

RUN node_modules/.bin/next build chatbot

RUN chmod +x /app/docker/entrypoint.sh \
    && mkdir -p /data

ENV NODE_ENV=production
ENV HOME=/root
ENV SHELL=/bin/bash
ENV DOVEPAW_DATA_DIR=/data
ENV DOVEPAW_PORT=8473

EXPOSE 8473
ENTRYPOINT ["/app/docker/entrypoint.sh"]
