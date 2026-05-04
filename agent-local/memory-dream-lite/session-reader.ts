import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface SessionEntry {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface SessionInfo {
  messages: SessionEntry[];
  cwd: string;
  gitBranch: string;
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null;
}

function str(val: unknown): string | undefined {
  return typeof val === "string" ? val : undefined;
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((c): c is { type: string; text?: string } => typeof c === "object" && c !== null)
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text!)
    .join("\n");
}

/** Parse a JSONL session file and return messages since the given ISO timestamp. */
export function parseSessionFile(filePath: string, since: string): SessionInfo | null {
  const lines = readFileSync(filePath, "utf8").trim().split("\n").filter(Boolean);
  const messages: SessionEntry[] = [];
  let cwd = "";
  let gitBranch = "";

  for (const line of lines) {
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRecord(raw)) continue;

    const type = raw.type;
    if (type !== "user" && type !== "assistant") continue;

    // Capture session metadata from any entry regardless of timestamp
    if (!cwd) cwd = str(raw.cwd) ?? "";
    if (!gitBranch) gitBranch = str(raw.gitBranch) ?? "";

    const timestamp = str(raw.timestamp);
    if (!timestamp || timestamp < since) continue;

    const msg = raw.message;
    if (!isRecord(msg)) continue;

    const role = str(msg.role);
    if (role !== "user" && role !== "assistant") continue;

    const text = extractText(msg.content);
    if (!text.trim()) continue;

    messages.push({ role, content: text, timestamp });
  }

  if (messages.length === 0) return null;
  return { messages, cwd, gitBranch };
}

/** List all session JSONL file paths under a project slug directory. */
export function listSessionFiles(projectsDir: string, slug: string): string[] {
  const dir = join(projectsDir, slug);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => join(dir, f));
}

/** Find all Claude Code project slugs for a given agent's workspace runs. */
export function discoverWorkspaceSlugs(projectsDir: string, agentName: string): string[] {
  const pattern = `-workspaces--${agentName}-`;
  if (!existsSync(projectsDir)) return [];
  return readdirSync(projectsDir).filter((slug) => slug.includes(pattern));
}
