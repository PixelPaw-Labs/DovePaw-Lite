/**
 * Reads per-agent config files and resolves derived artefacts needed at
 * execution time: environment variables and repo slugs.
 */

import { readSettings, readAgentSettings } from "@@/lib/settings";
import { resolveSettingsEnv } from "@/lib/env-resolver";

export class AgentConfigReader {
  /**
   * Resolves the agent's execution environment fresh from disk so that settings
   * changes take effect on the next run without a server restart.
   */
  async resolveAgentSettings(
    agentName: string,
  ): Promise<{ extraEnv: Record<string, string>; repoSlugs: string[] }> {
    const settings = await readSettings();
    const agentSettings = await readAgentSettings(agentName);
    const extraEnv = resolveSettingsEnv(settings, agentSettings.envVars);
    const repoSlugs = agentSettings.repos
      .map((id) => settings.repositories.find((r) => r.id === id))
      .filter((r): r is NonNullable<typeof r> => r !== undefined)
      .map((r) => r.githubRepo);
    return { extraEnv, repoSlugs };
  }
}
