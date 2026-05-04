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

// ─── Builder ──────────────────────────────────────────────────────────────────

/** Hooks for the QueryAgentExecutor sub-agent query(). */
export function buildSubAgentHooks(
  cwd: string,
  additionalDirectories: string[],
  registry: PendingRegistry,
  behaviorReminder?: string,
  responseReminder?: string,
): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  const trimmed = behaviorReminder?.trim();
  return buildAgentHooks({
    postToolUseMatcher: "mcp__agents__await_.*",
    registry,
    userPromptReminder: trimmed ? `<reminder>\n${trimmed}\n</reminder>` : undefined,
    allowedDirectories: [cwd, ...additionalDirectories],
    disallowedTools: ALWAYS_DISALLOWED_TOOLS,
    responseReminder,
  });
}
