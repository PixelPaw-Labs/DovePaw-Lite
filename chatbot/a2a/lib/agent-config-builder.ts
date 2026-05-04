/**
 * AgentConfig type and its factory function.
 *
 * Kept separate from spawn.ts so the type can be imported by agent-script-tools.ts
 * (and tests) without pulling in spawning dependencies.
 */

import type { AgentDef } from "@@/lib/agents";
import { agentEntryPath } from "@@/lib/paths";

export interface AgentConfig {
  scriptPath: string;
  agentName: string;
  whatItDoes: string;
  /** Resolved env vars from settings to merge into the spawned process environment. */
  extraEnv?: Record<string, string>;
  /** The workspace directory for this run — used as cwd when spawning the agent script. */
  workspacePath: string;
}

/**
 * Build the AgentConfig for a script execution run.
 *
 * Build the AgentConfig for a script execution run.
 *
 * Merges workspace-specific env vars (AGENT_WORKSPACE, REPO_LIST) on top of
 * the pre-resolved extraEnv. scriptPath is resolved from def.entryPath.
 */
export function buildAgentConfig(
  def: AgentDef,
  cwd: string,
  extraEnv: Record<string, string>,
  repoSlugs: string[],
): AgentConfig {
  const scriptPath = agentEntryPath(def.entryPath);
  return {
    scriptPath,
    agentName: def.displayName,
    whatItDoes: def.description,
    workspacePath: cwd,
    extraEnv: {
      ...extraEnv,
      AGENT_WORKSPACE: cwd,
      ...(repoSlugs.length > 0 ? { REPO_LIST: repoSlugs.join(",") } : {}),
    },
  };
}
