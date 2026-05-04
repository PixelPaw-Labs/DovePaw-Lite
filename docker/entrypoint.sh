#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/app"
DOVEPAW_PORT="${DOVEPAW_PORT:-8473}"
DOVEPAW_DATA_DIR="${DOVEPAW_DATA_DIR:-/data}"

echo "=== DovePaw Lite starting === port=${DOVEPAW_PORT} data=${DOVEPAW_DATA_DIR}"

mkdir -p "${DOVEPAW_DATA_DIR}" "${HOME:-/root}/.claude"
cd "${APP_ROOT}"

# ─── Secrets injection ────────────────────────────────────────────────────────
# Local Docker mode: set EJSON_FILE to the mounted encrypted secrets file.
#   Private key is resolved from ~/.ejson/keys/<pubkey> (mount ~/.ejson:/root/.ejson:ro)
#   or from the EJSON_PRIVATE_KEY environment variable.
#
# ECS / cloud mode: ANTHROPIC_API_KEY and other secrets are already injected as
#   plain env vars by the ECS task definition secrets block (ASM or SSM).
#   EJSON_FILE is not set → this block is a no-op.
if [ -n "${EJSON_FILE:-}" ] && [ -f "${EJSON_FILE}" ]; then
    echo "--- Decrypting EJSON secrets from ${EJSON_FILE}..."
    eval "$(node /app/docker/ejson-inject.mjs "${EJSON_FILE}")"
    echo "--- Secrets injected."
fi

# ─── Setup ───────────────────────────────────────────────────────────────────
# Syncs agent.json files, deploys SDK to DOVEPAW_DATA_DIR, links skills.
# Must complete before A2A servers start.
echo "--- Running setup..."
node_modules/.bin/tsx scripts/setup.ts
echo "--- Setup complete."

# ─── Start A2A servers ───────────────────────────────────────────────────────
# Each agent gets an OS-assigned port. A port manifest is written to
# ${DOVEPAW_DATA_DIR}/.ports.${DOVEPAW_PORT}.json for Next.js to discover.
echo "--- Starting A2A servers..."
DOVEPAW_PORT="${DOVEPAW_PORT}" node_modules/.bin/tsx chatbot/a2a/start-all.ts &
A2A_PID=$!

# Brief pause so the port manifest is written before Next.js logs start.
# Next.js reads the manifest per-request (not at startup), so this is cosmetic.
sleep 2

# ─── Start Next.js ───────────────────────────────────────────────────────────
echo "--- Starting Next.js (port ${DOVEPAW_PORT})..."
DOVEPAW_PORT="${DOVEPAW_PORT}" node_modules/.bin/next start chatbot -p "${DOVEPAW_PORT}" &
NEXT_PID=$!

# ─── Signal propagation ──────────────────────────────────────────────────────
_shutdown() {
    echo "=== DovePaw Lite shutting down ==="
    kill -TERM "${A2A_PID}" "${NEXT_PID}" 2>/dev/null || true
    wait "${A2A_PID}" "${NEXT_PID}" 2>/dev/null || true
    exit 0
}
trap _shutdown SIGTERM SIGINT

# Wait for the first process to exit. If either dies unexpectedly, shut both down.
wait -n "${A2A_PID}" "${NEXT_PID}" 2>/dev/null || true
echo "=== A process exited unexpectedly — shutting down ==="
_shutdown
