import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { agentPersistentStateDir } from "@dovepaw/agent-sdk";

export interface AgentMemoryInfo {
  agentName: string;
  memoryDir: string;
  memoryFile: string;
  memoryContent: string;
  topicFiles: Array<{ name: string; path: string; content: string }>;
}

/** Discover memory directories for all sub-agents (excludes memory-dream-lite and memory-distiller-lite). */
export function discoverAgentMemories(
  agentSettingsDir: string,
  excludeNames: Set<string>,
): AgentMemoryInfo[] {
  const infos: AgentMemoryInfo[] = [];

  if (!existsSync(agentSettingsDir)) return infos;

  for (const entry of readdirSync(agentSettingsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || excludeNames.has(entry.name)) continue;

    const agentName = entry.name;
    const memoryDir = join(agentPersistentStateDir(agentName), "memory");
    const memoryFile = join(memoryDir, "MEMORY.md");

    if (!existsSync(memoryFile)) continue;
    const memoryContent = readFileSync(memoryFile, "utf-8").trim();
    if (!memoryContent) continue;

    const topicFiles: AgentMemoryInfo["topicFiles"] = [];
    for (const f of readdirSync(memoryDir)) {
      if (f === "MEMORY.md" || !f.endsWith(".md")) continue;
      const path = join(memoryDir, f);
      const content = readFileSync(path, "utf-8").trim();
      if (content) topicFiles.push({ name: f, path, content });
    }

    infos.push({ agentName, memoryDir, memoryFile, memoryContent, topicFiles });
  }

  return infos;
}
