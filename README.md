# DavePaw

An agent orchestration runtime. One Dove chatbot, one A2A server layer, your agent scripts in `agent-local/`.

---

## Claude Code Agent SDK

Dove is built on the [`@anthropic-ai/claude-agent-sdk`](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) — the same runtime that powers Claude Code itself.

The SDK's `query()` function runs Dove as a stateful agent loop. It handles the Claude API calls, tool dispatch, and — critically — **conversation memory**. There is no database for chat history in this project. Conversation continuity is entirely managed by the SDK: each turn passes `resume: sessionId` to `query()`, which replays the session from the SDK's own storage under `~/.claude/projects/`. The in-memory store (`db-lite.ts`) only tracks lightweight UI metadata (session status, progress labels) — not message content.

```typescript
// chatbot/app/api/chat/route.ts — simplified
query({
  prompt: message,
  options: {
    // Resume picks up the full conversation history from ~/.claude/projects/
    ...(sessionId ? { resume: sessionId } : {}),
    mcpServers: { agents: mcpServer },  // inject ask_*/start_*/await_* tools
    systemPrompt: { type: "preset", preset: "claude_code", append: buildSystemPrompt() },
  },
});
```

The SDK also provides the `tool()` factory used to define each agent's MCP tools, and the `hooks` / `canUseTool` callbacks used to gate permissions and stream progress to the browser.

**What this means in practice:** conversation history survives process restarts (it lives in `~/.claude/`), but is tied to the machine. For server deployments where the container is ephemeral, each restart begins a fresh conversation. If you need persistent cross-restart history, add a session export step before container shutdown.

---

## Architecture

```
Browser (Next.js)
  ↓ SSE  /api/chat
Dove — Claude Agent SDK orchestrator
  ↓ ask_* / start_* / await_* MCP tools
A2A Servers — one Express process per agent (OS-assigned ports)
  ↓ spawn tsx
Agent Scripts — TypeScript files in agent-local/<name>/main.ts
```

### How it flows

1. **Browser → Dove.** The user sends a message to the Next.js chat UI. Dove is a Claude Agent SDK `query()` session that receives the message and a set of MCP tools — one trio (`ask_*`, `start_*`, `await_*`) per registered agent.

2. **Dove → A2A server.** When Dove decides to invoke an agent, it calls one of its MCP tools. The tool sends an A2A message to that agent's Express server over SSE. Ports are OS-assigned at startup and published to `~/.dovepaw-lite/.ports.<port>.json` — no hardcoded ports.

3. **A2A server → agent script.** The A2A server spawns the agent's `main.ts` via `tsx`. The script receives the instruction as `process.argv[2]`, runs its TypeScript logic, and returns output. The server streams the result back up through the A2A protocol to Dove, then to the browser as SSE events.

4. **Scheduling.** Agents with a `schedule` field in their `agent.json` can be installed as cron jobs (Linux) or launchd daemons (macOS) via `npm run install`. The scheduler fires the A2A trigger script on the configured interval. No schedule = on-demand only.

### Key design decisions

| Decision | Reason |
|---|---|
| In-memory session store | Conversation memory lives in the Claude Code SDK (`~/.claude/`), not a DB — the store only tracks UI metadata |
| `agent-local/` scanned at startup | Agent discovery is a directory scan — add a folder, restart, it appears |
| OS-assigned A2A ports | No port conflicts, no config to maintain |
| Platform-neutral scheduler abstraction | `lib/scheduler.ts` adapts to launchd (macOS) or cron (Linux) |

---

## Repo Layout

```
agent-local/              ← your agent scripts live here
  hello-world/
    agent.json            ← agent metadata: name, icon, schedule, MCP description
    main.ts               ← agent entry point

chatbot/
  app/                    ← Next.js pages and API routes
  a2a/                    ← A2A Express servers (one per agent)
  lib/                    ← shared chatbot utilities, session store, hooks

lib/                      ← shared library: agents, scheduler, settings, paths
packages/agent-sdk/       ← shared agent utilities (Claude/Codex runners, git, logger)

scripts/
  chatbot-start.ts        ← starts A2A servers + Next.js dev server
```

---

## Getting Started

**Prerequisites:** Node.js 20+, Claude Code CLI authenticated (or `ANTHROPIC_API_KEY` set).

```bash
npm install
npm run dev        # starts A2A servers + Next.js on an available port
```

Open the URL printed by Next.js. Dove appears in the sidebar. The `hello-world` agent is already registered — send it a message to verify the stack is working.

---

## Adding an Agent

> **Quickstart:** In Claude Code, run `/sub-agent-builder` to scaffold a new agent interactively — it handles file creation, registration, and skill setup end-to-end.

To add an agent manually:

1. Create a directory under `agent-local/`:

```
agent-local/my-agent/
  agent.json
  main.ts
```

2. **`agent.json`** — required fields:

```json
{
  "version": 1,
  "name": "my-agent",
  "alias": "ma",
  "displayName": "My Agent",
  "description": "What this agent does — shown to Dove as the MCP tool description.",
  "iconName": "Bot",
  "schedulingEnabled": false,
  "locked": false,
  "doveCard": {
    "title": "My Agent",
    "description": "Short description for the Dove card grid",
    "prompt": "What does My Agent do?"
  },
  "suggestions": [
    {
      "title": "Run it",
      "description": "Trigger the agent",
      "prompt": "Run my agent now"
    }
  ],
  "repos": [],
  "envVars": []
}
```

3. **`main.ts`** — receives the user's instruction as `process.argv[2]`:

```typescript
import { createLogger } from "@dovepaw/agent-sdk";

const log = createLogger("my-agent");
const instruction = process.argv[2] ?? "no instruction";

log.info(`Running with: ${instruction}`);
// your logic here
console.log("Done.");
```

4. Restart `npm run dev` — the agent appears in the Dove sidebar automatically.

### Scheduling an agent

Add a `schedule` field to `agent.json` and set `schedulingEnabled: true`:

```json
"schedulingEnabled": true,
"schedule": { "type": "calendar", "hour": 9, "minute": 0 }
```

Then run `npm run install` to generate and activate the scheduler config. The agent will fire daily at 09:00 via launchd (macOS) or cron (Linux).

### Environment variables

Per-agent env vars are declared in `agent.json` under `envVars`:

```json
"envVars": [
  { "key": "MY_API_KEY", "value": "" }
]
```

Fill in values through the Settings UI (Settings → agent name → Env Vars tab). Values are stored in `~/.dovepaw-lite/settings.agents/<name>/agent.json` outside the repo.

---

## Configuration

All runtime state lives outside the repo under `~/.dovepaw-lite/` (override with `DOVEPAW_DATA_DIR` env var for server deployments):

| Path | Contents |
|---|---|
| `~/.dovepaw-lite/settings.json` | global settings: repositories, Dove persona, env vars |
| `~/.dovepaw-lite/settings.agents/<name>/agent.json` | per-agent repos, env vars, schedule |
| `~/.dovepaw-lite/workspaces/` | isolated execution workspace roots |
| `~/.dovepaw-lite/agents/state/` | persistent per-agent state |
| `~/.dovepaw-lite/agents/logs/` | per-agent log files |
| `~/.dovepaw-lite/cron/` | compiled scheduler scripts (generated by `npm run install`) |

### Server / ECS deployment

Set `S3_CONFIG_BUCKET` to enable S3 write-through for all JSON config writes. On container startup, pull config before starting the app:

```bash
aws s3 sync s3://$S3_CONFIG_BUCKET/ ${DOVEPAW_DATA_DIR:-~/.dovepaw}/
npm run dev
```

**ECS env vars:**

| Env var | Required | Description |
|---|---|---|
| `S3_CONFIG_BUCKET` | Optional | S3 bucket name — activates write-through; unset = local mode only |
| `DOVEPAW_DATA_DIR` | Optional | Override data dir (default: `~/.dovepaw-lite/`) |
| `AWS_REGION` | When S3 used | AWS region for the S3 client |
| `ANTHROPIC_API_KEY` | Required | Claude API key passed to the Claude Code CLI subprocess |
| `CLAUDE_CLI_PATH` | Optional | Path to the Claude Code CLI binary (default: `~/.local/bin/claude`) |
| `OPENAI_API_KEY` | When using Codex | Required if `AGENT_SCRIPT_MODEL` is a GPT/Codex model |
