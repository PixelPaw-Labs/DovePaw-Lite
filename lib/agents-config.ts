import {
  readFile,
  writeFile,
  mkdir,
  copyFile,
  readdir,
  rm,
  access,
  constants,
} from "node:fs/promises";
import { join, dirname } from "node:path";
import { agentFileSchema, type AgentConfigEntry, type AgentFile } from "./agents-config-schemas";
import { buildAgentDef } from "./agents";
import { AGENT_SETTINGS_DIR, agentDefinitionFile } from "./paths";
import type { AgentDef } from "./agents";
import { pushConfig } from "./s3-config-sync";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function tryParseFile(file: string): Promise<AgentFile | null> {
  if (!(await fileExists(file))) return null;
  try {
    const result = agentFileSchema.safeParse(JSON.parse(await readFile(file, "utf-8")));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Read a single agent's combined definition+settings file from settings.agents/.
 * Returns null when the file is absent or corrupt.
 */
export async function readAgentFile(agentName: string): Promise<AgentFile | null> {
  const file = agentDefinitionFile(agentName);
  const bak = `${file}.bak`;
  const primary = await tryParseFile(file);
  if (primary !== null) return primary;
  const backup = await tryParseFile(bak);
  if (backup !== null) {
    await copyFile(bak, file);
    return backup;
  }
  return null;
}

/** Scan all settings.agents/ subdirectories and return their parsed agent.json files. */
async function readAllAgentFiles(): Promise<AgentFile[]> {
  if (!(await fileExists(AGENT_SETTINGS_DIR))) return [];
  try {
    const entries = await readdir(AGENT_SETTINGS_DIR, { withFileTypes: true });
    const results = await Promise.all(
      entries.filter((d) => d.isDirectory()).map((d) => readAgentFile(d.name)),
    );
    return results.filter((e): e is AgentFile => e !== null);
  } catch {
    return [];
  }
}

/**
 * Read agent config entries (definition fields only) from all settings.agents/ dirs.
 * Returns [] when settings.agents/ is absent or empty.
 */
export async function readAgentConfigEntries(): Promise<AgentConfigEntry[]> {
  const files = await readAllAgentFiles();
  return files.map(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ({ repos: _r, envVars: _e, version: _v, locked: _l, ...entry }) => entry,
  );
}

/** Read agents config and hydrate each entry into a full AgentDef. */
export async function readAgentsConfig(): Promise<AgentDef[]> {
  return (await readAgentConfigEntries()).map(buildAgentDef);
}

// ─── Write ────────────────────────────────────────────────────────────────────

/** Persist a combined agent file to settings.agents/<name>/agent.json (with .bak). */
export async function writeAgentFile(agentName: string, file: AgentFile): Promise<void> {
  const dest = agentDefinitionFile(agentName);
  await mkdir(dirname(dest), { recursive: true });
  const data = JSON.stringify(file, null, 2) + "\n";
  await writeFile(dest, data, "utf-8");
  await copyFile(dest, `${dest}.bak`);
  await pushConfig(`settings.agents/${agentName}/agent.json`, data);
}

/** Create a new agent file with empty repos/envVars. */
export async function createAgentFile(entry: AgentConfigEntry): Promise<void> {
  await writeAgentFile(entry.name, { version: 1, ...entry, repos: [], envVars: [], locked: false });
}

/**
 * Apply a partial patch to an agent file.
 * Only the specified fields are updated — all other fields are preserved.
 */
export async function patchAgentFile(
  agentName: string,
  patch: Partial<AgentFile>,
): Promise<AgentFile> {
  const current: AgentFile = (await readAgentFile(agentName)) ?? {
    version: 1,
    name: agentName,
    alias: agentName.slice(0, 3),
    displayName: agentName,
    description: "",
    doveCard: { title: agentName, description: "", prompt: "" },
    suggestions: [],
    repos: [],
    envVars: [],
    locked: false,
  };
  const updated: AgentFile = {
    ...current,
    ...patch,
    version: 1,
    locked: patch.locked ?? current.locked,
  };
  await writeAgentFile(agentName, updated);
  return updated;
}

/** Update only the definition fields of an agent (everything except repos/envVars/locked). */
export async function patchAgentDefinition(
  agentName: string,
  defPatch: Partial<Omit<AgentConfigEntry, "envVars">>,
): Promise<void> {
  await patchAgentFile(agentName, defPatch);
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/** Delete the agent's directory from settings.agents/. */
export async function deleteAgentDefinition(agentName: string): Promise<void> {
  const dir = join(AGENT_SETTINGS_DIR, agentName);
  if (await fileExists(dir)) {
    await rm(dir, { recursive: true });
  }
}
