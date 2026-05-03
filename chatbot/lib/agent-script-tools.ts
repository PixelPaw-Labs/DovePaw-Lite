import { tool } from "@anthropic-ai/claude-agent-sdk";
import type { AgentDef } from "@@/lib/agents";
import { formatScheduleDisplay } from "@@/lib/agents-config-schemas";
import { agentEntryPath, agentPersistentLogDir, agentPersistentStateDir } from "@/lib/paths";
import { z } from "zod";
import { startScript, awaitScript } from "@/a2a/lib/spawn";
import type { AgentConfig } from "@/a2a/lib/agent-config-builder";
import { recloneReposIntoWorkspace } from "@/a2a/lib/workspace";
import type { PendingRegistry } from "@/lib/pending-registry";

// ─── Script run tool name helpers ─────────────────────────────────────────────

/** Tool name for firing the agent script in the background (start_run_script_* pattern). */
export const startRunScriptToolName = (manifestKey: string): string => `start_${manifestKey}`;
/** Tool name for polling a previously started script run (await_run_script_* pattern). */
export const awaitRunScriptToolName = (manifestKey: string): string => `await_${manifestKey}`;
/** Appends the standard reminder suffix that forces the agent to call the start tool. */
export const withStartReminder = (instruction: string, manifestKey: string): string =>
  `${instruction}\n<reminder>Must call "${startRunScriptToolName(manifestKey)}" tool</reminder>`;
/** Prepends a memory-check instruction: read memory first, reply directly if sufficient, otherwise tell the caller to use the start tool. */
export const withMemoryReminder = (
  instruction: string,
  memoryDir: string,
  manifestKey: string,
): string =>
  `<memory_check>
If the request is about the agent itself (e.g. status, configuration, management), skip this step.
Otherwise, read and search ${memoryDir}/memory/MEMORY.md.
If the file does not exist, or memory is insufficient to answer the user, respond with: "Please call \`${startRunScriptToolName(manifestKey)}\` to fulfil this request."
If memory is sufficient, reply directly.
</memory_check>
${instruction}`;

// ─── Script run tools ─────────────────────────────────────────────────────────

/** Fires the agent script in the background and returns a runId immediately. */
export function makeStartScriptTool(
  agent: AgentDef,
  config: AgentConfig,
  repoSlugs: string[],
  signal?: AbortSignal,
  onProgress?: (message: string, artifacts: Record<string, string>) => void,
  taskId?: string,
  registry?: PendingRegistry,
) {
  return tool(
    startRunScriptToolName(agent.manifestKey),
    `Start the ${agent.displayName} agent script in the background and return a runId immediately`,
    {
      instruction: z
        .string()
        .optional()
        .describe(`Instruction to pass to the ${agent.displayName} script`),
    },
    async ({ instruction = "" }) => {
      const finalInstruction = instruction;
      const clonedPaths = await recloneReposIntoWorkspace(
        config.workspacePath,
        repoSlugs,
        undefined,
        onProgress ? (slug: string) => onProgress(`Cloning`, { repo: slug }) : undefined,
      );
      // Overwrite REPO_LIST with local paths so the agent script can do file I/O.
      // Inject DOVEPAW_TASK_ID so the script can POST progress to the A2A server.
      const finalConfig = {
        ...config,
        extraEnv: {
          ...config.extraEnv,
          ...(taskId ? { DOVEPAW_TASK_ID: taskId } : {}),
          ...(clonedPaths.length > 0 ? { REPO_LIST: clonedPaths.join(",") } : {}),
        },
      };
      const { runId } = startScript(finalConfig, finalInstruction, signal, taskId);
      registry?.register({
        awaitTool: awaitRunScriptToolName(agent.manifestKey),
        idKey: "runId",
        id: runId,
      });
      return {
        content: [{ type: "text" as const, text: `Script started (runId: ${runId})` }],
        structuredContent: { runId },
      };
    },
  );
}

/** Polls a previously started script run; returns output or still_running. */
export function makeAwaitScriptTool(agent: AgentDef, registry?: PendingRegistry) {
  return tool(
    awaitRunScriptToolName(agent.manifestKey),
    `Await a previously started ${agent.displayName} script run. Returns the output when complete, or { status: "still_running", runId } if still in progress.`,
    {
      runId: z
        .string()
        .describe(`The runId returned by ${startRunScriptToolName(agent.manifestKey)}`),
    },
    async ({ runId }) => {
      const result = await awaitScript(runId);
      if (result.status === "completed" || result.status === "not_found") {
        registry?.resolve(runId);
      }
      return {
        content: [
          {
            type: "text" as const,
            text:
              result.status === "completed"
                ? result.output
                : result.status === "still_running"
                  ? [
                      "Agent script is still running...",
                      result.latestOutput ? `Latest output:\n${result.latestOutput}` : "",
                    ]
                      .filter(Boolean)
                      .join("\n")
                  : `⚠️ Run \`${runId}\` not found — it may have completed and been cleaned up.`,
          },
        ],
        structuredContent: result,
      };
    },
  );
}

// ─── Sub-agent system prompt ───────────────────────────────────────────────────

/** Builds the system prompt appended to the query() sub-agent inside QueryAgentExecutor. */
export function buildSubAgentPrompt(agent: AgentDef): string {
  const opening =
    agent.personality ??
    "You are one of Dove's mice — a small, focused agent working on behalf of Dove, the orchestrator. Dove delegates tasks to you; your job is to get them done quietly and reliably without second-guessing or over-explaining.";
  return `${opening}

Your assigned role: **${agent.displayName}**
${agent.description}

**When asked about this agent, THOROUGHLY explore and explain:**
- What it does
- How it does it (implementation details, not high-level marketing speak)
- What env vars it needs
- What inputs it requires
- What the workflow is
- When it normally runs: ${formatScheduleDisplay(agent.schedule)}
- Whether it is already scheduled/active
- Any other dependencies

${
  agent.schedule && agent.schedulingEnabled
    ? `**Infer intent before acting — read existing output before running anything:**

This agent runs on a schedule (${formatScheduleDisplay(agent.schedule)}) and produces output (files, logs, state) during those runs. Before calling the MCP tool, ask yourself: is the user asking about something that has already happened, or do they want to trigger something new?

- Clearly asking about past/existing state (e.g. past tense, "what happened", "show me logs", "last night's output") → look for existing output first; only run if nothing useful is found
- Everything else → call \`${startRunScriptToolName(agent.manifestKey)}\` with the instruction as-is; do not ask for clarification`
    : `**This agent runs on-demand only** — there are no scheduled runs and no past output to look for. When the user's intent is to run this agent, call \`${startRunScriptToolName(agent.manifestKey)}\` directly without looking for prior output.`
}

**Your file boundaries — only access YOUR files, never other agents':**

| Resource | Path |
|---|---|
| Source | \`${agentEntryPath(agent.entryPath)}\` |
| Logs | \`${agentPersistentLogDir(agent.name)}\` |
| State | \`${agentPersistentStateDir(agent.name)}\` |

Do NOT read, modify, or reference any files outside these paths.`;
}
