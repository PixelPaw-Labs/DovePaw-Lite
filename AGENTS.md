# DovePaw Lite — Architecture Overview

DovePaw Lite is a self-contained multi-agent orchestration platform. It provides the runtime, chatbot UI, and tooling for running autonomous AI agents. Agents can be invoked directly via chat, triggered by an orchestrating agent, or scheduled as macOS launchd daemons — scheduling is optional and per-agent. Agent scripts live directly in the repo under `agent-local/` — there is no external plugin system.

## Three-Layer Runtime

```
Browser UI
  Next.js chatbot (port 7473)
        ↓ SSE
Claude Agent SDK  (in-process MCP server)
  ask_* / start_* / await_* tools — one trio per registered agent
        ↓ A2A SSE
A2A Servers  (one Express process per agent, OS-assigned ports)
        ↓ spawn tsx
Agent Scripts  (agent-local/<name>/main.ts, run as launchd daemons)
```

Each agent exposes three MCP tools to the chatbot layer:

| Tool pattern | Behaviour |
|---|---|
| `ask_*` | Blocking — waits for the agent to complete |
| `start_*` | Fire-and-forget — returns a session ID immediately |
| `await_*` | Poll — retrieves the result of a prior `start_*` call |

## Agent Structure

Agent scripts live in the repo at `agent-local/<name>/main.ts` (or the `scriptFile` named in their config). Each agent is registered by placing a combined definition + settings file at `~/.dovepaw-lite/settings.agents/<name>/agent.json`. New agents can be added via the Settings UI ("Add Agent" dialog) or by writing the JSON file directly.

```
agent-local/
  <agent-name>/
    main.ts       — agent entry point (TypeScript)

~/.dovepaw-lite/settings.agents/<agent-name>/
  agent.json      — agent definition + per-agent runtime settings
```

## Key Concepts

**Agent registry.** The set of active agents is determined at runtime by which `agent.json` files exist under `~/.dovepaw-lite/settings.agents/`. The registry builds `AgentDef` objects from these files at startup — no hardcoded agent list in the source.

**Dynamic ports.** A2A servers bind to OS-assigned ports at startup and publish a port manifest to `~/.dovepaw-lite/`. The chatbot polls this manifest to discover server addresses — no hardcoded ports anywhere.

**MCP tool naming.** Each agent's MCP tool name is derived as `yolo_<agent_name_with_underscores>` from the agent's kebab-case name in its `agent.json`.

**Parallel execution.** Agents that support concurrent work spawn multiple Claude CLI subprocesses in isolated git worktrees simultaneously. A watchdog reclaims orphaned worktrees on exit.

**Environment isolation.** Agent processes run with a sanitised environment (clean PATH, `CLAUDECODE` unset) so nested Claude CLI invocations work correctly. Per-agent secrets are injected at daemon install time from settings.

**User data directory.** All runtime state lives outside the repo under `~/.dovepaw-lite/`:
- `settings.json` — global settings (repositories, API keys, Dove persona)
- `settings.agents/` — per-agent config (definition, schedule, env vars, repos)
- `workspaces/` — isolated agent execution roots
- `cron/` — compiled daemon scripts deployed by `npm run install`

## Tech Stack

| Layer | Technology |
|---|---|
| UI | Next.js + React, Tailwind CSS + shadcn/ui |
| Agent SDK | @anthropic-ai/claude-agent-sdk |
| Agent protocol | @a2a-js/sdk (SSE) |
| Agent runtime | TypeScript via tsx, bundled with tsup |
| Daemon management | macOS launchd |
| Schema validation | Zod |
| Linting / formatting | oxlint + oxfmt |
| Testing | Vitest |

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **DovePaw-Lite** (3656 symbols, 6912 relationships, 256 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/DovePaw-Lite/context` | Codebase overview, check index freshness |
| `gitnexus://repo/DovePaw-Lite/clusters` | All functional areas |
| `gitnexus://repo/DovePaw-Lite/processes` | All execution flows |
| `gitnexus://repo/DovePaw-Lite/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
