/**
 * Hook configuration specific to the QueryAgentExecutor sub-agent query().
 *
 * Separated from hooks.ts (generic/Dove hooks) so sub-agent concerns
 * — script start/await reminder — are owned and maintained here independently.
 */

import type { HookCallbackMatcher, HookEvent } from "@anthropic-ai/claude-agent-sdk";
import { buildAgentHooks } from "@/lib/hooks";
import type { PendingRegistry } from "@/lib/pending-registry";
import { ALWAYS_DISALLOWED_TOOLS } from "@@/lib/security-policy";
import { buildSubAgentReminder } from "@@/lib/subagent-reminder";

// ─── Builder ──────────────────────────────────────────────────────────────────

/** Hooks for the QueryAgentExecutor sub-agent query(). */
export function buildSubAgentHooks(
  cwd: string,
  additionalDirectories: string[],
  registry: PendingRegistry,
  behaviorReminder?: string,
): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  return buildAgentHooks({
    postToolUseMatcher: "mcp__agents__await_.*",
    registry,
    userPromptReminder: buildSubAgentReminder(behaviorReminder),
    allowedDirectories: [cwd, ...additionalDirectories],
    disallowedTools: ALWAYS_DISALLOWED_TOOLS,
  });
}
