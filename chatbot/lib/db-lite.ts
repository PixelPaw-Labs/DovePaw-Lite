import type { SessionMessage } from "@/lib/message-types";
import { mergeProgress } from "@/lib/progress";
import type { ProgressEntry } from "@/lib/progress";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DOVEPAW_DIR } from "@@/lib/paths";

export type { SessionMessage };

export type SessionStatus = "running" | "done" | "cancelled";

export interface SessionDetail {
  id: string;
  agentId: string;
  startedAt: string;
  label: string;
  messages: SessionMessage[];
  progress: ProgressEntry[];
  resumeSeq: number;
  status: SessionStatus;
}

export interface UpsertSessionArgs {
  id: string;
  agentId: string;
  startedAt: string;
  label: string;
  messages: SessionMessage[];
  progress: ProgressEntry[];
  subagentSessionId?: string;
  workspacePath?: string;
  resumeSeq?: number;
  status?: SessionStatus;
  senderAgentId?: string;
}

export interface SessionResumable {
  subagentSessionId: string;
  workspacePath: string;
  startedAt: string;
  label: string;
}

// ─── In-memory store (messages / progress / status) ───────────────────────────

interface StoredSession {
  id: string;
  agentId: string;
  startedAt: string;
  label: string;
  messages: SessionMessage[];
  progress: ProgressEntry[];
  resumeSeq: number;
  status: SessionStatus;
}

const sessions = new Map<string, StoredSession>();

// ─── SQLite (resume fields + orchestrator context) ────────────────────────────

let _db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (_db) return _db;
  mkdirSync(DOVEPAW_DIR, { recursive: true });
  _db = new DatabaseSync(join(DOVEPAW_DIR, "dovepaw-lite.db"));
  _db.exec("PRAGMA journal_mode = WAL");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS session_resume (
      context_id          TEXT PRIMARY KEY,
      agent_id            TEXT NOT NULL,
      started_at          TEXT NOT NULL,
      label               TEXT NOT NULL,
      subagent_session_id TEXT,
      workspace_path      TEXT
    );
    CREATE TABLE IF NOT EXISTS dove_agent_contexts (
      orchestrator_session_id TEXT NOT NULL,
      manifest_key            TEXT NOT NULL,
      subagent_a2a_context_id TEXT NOT NULL,
      PRIMARY KEY (orchestrator_session_id, manifest_key)
    );
  `);
  return _db;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function messageContentKey(m: SessionMessage): string {
  return `${m.role}:${JSON.stringify(m.segments)}`;
}

function mergeMessages(existing: SessionMessage[], incoming: SessionMessage[]): SessionMessage[] {
  const incomingById = new Map(incoming.map((m) => [m.id, m]));
  const merged = existing.map((m) => incomingById.get(m.id) ?? m);
  const existingIds = new Set(existing.map((m) => m.id));
  const existingKeys = new Set(existing.map(messageContentKey));
  return [
    ...merged,
    ...incoming.filter((m) => !existingIds.has(m.id) && !existingKeys.has(messageContentKey(m))),
  ];
}

// ─── Exported functions ───────────────────────────────────────────────────────

export function closeDb(): void {
  _db?.close();
  _db = null;
}

export function upsertSession(args: UpsertSessionArgs): void {
  const existing = sessions.get(args.id);
  sessions.set(args.id, {
    id: args.id,
    agentId: args.agentId,
    startedAt: args.startedAt,
    label: args.label,
    messages: mergeMessages(existing?.messages ?? [], args.messages),
    progress: mergeProgress(existing?.progress ?? [], args.progress),
    resumeSeq: args.resumeSeq ?? existing?.resumeSeq ?? 0,
    status: args.status ?? existing?.status ?? "done",
  });

  getDb()
    .prepare(
      `INSERT INTO session_resume (context_id, agent_id, started_at, label, subagent_session_id, workspace_path)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(context_id) DO UPDATE SET
         subagent_session_id = COALESCE(excluded.subagent_session_id, session_resume.subagent_session_id),
         workspace_path      = COALESCE(excluded.workspace_path, session_resume.workspace_path)`,
    )
    .run(
      args.id,
      args.agentId,
      args.startedAt,
      args.label,
      args.subagentSessionId ?? null,
      args.workspacePath ?? null,
    );
}

export function getSessionResumable(contextId: string, agentId: string): SessionResumable | null {
  const row = getDb()
    .prepare(
      "SELECT subagent_session_id, workspace_path, started_at, label FROM session_resume WHERE context_id = ? AND agent_id = ?",
    )
    .get(contextId, agentId);
  if (!row) return null;
  const { subagent_session_id, workspace_path, started_at, label } = row;
  if (
    typeof subagent_session_id !== "string" ||
    typeof workspace_path !== "string" ||
    typeof started_at !== "string" ||
    typeof label !== "string"
  )
    return null;
  return {
    subagentSessionId: subagent_session_id,
    workspacePath: workspace_path,
    startedAt: started_at,
    label,
  };
}

export function getSessionStatus(id: string): SessionStatus | null {
  return sessions.get(id)?.status ?? null;
}

export function setSessionStatus(id: string, status: SessionStatus): void {
  const s = sessions.get(id);
  if (s) s.status = status;
}

export function closeStaleSessions(): void {}

export function getSessionDetail(id: string): SessionDetail | null {
  const s = sessions.get(id);
  if (!s) return null;
  return { ...s };
}

export function deleteSession(id: string): void {
  sessions.delete(id);
  const db = getDb();
  db.prepare("DELETE FROM session_resume WHERE context_id = ?").run(id);
  db.prepare(
    "DELETE FROM dove_agent_contexts WHERE orchestrator_session_id = ? OR subagent_a2a_context_id = ?",
  ).run(id, id);
}

export function deleteAllSessions(): void {
  sessions.clear();
  const db = getDb();
  db.exec("DELETE FROM session_resume");
  db.exec("DELETE FROM dove_agent_contexts");
}

export function setOrchestratorAgentContext(
  orchestratorSessionId: string,
  manifestKey: string,
  subagentA2aContextId: string,
): void {
  getDb()
    .prepare(
      `INSERT INTO dove_agent_contexts (orchestrator_session_id, manifest_key, subagent_a2a_context_id)
       VALUES (?, ?, ?)
       ON CONFLICT(orchestrator_session_id, manifest_key) DO UPDATE SET
         subagent_a2a_context_id = excluded.subagent_a2a_context_id`,
    )
    .run(orchestratorSessionId, manifestKey, subagentA2aContextId);
}

export function getOrchestratorAgentContexts(orchestratorSessionId: string): Map<string, string> {
  const rows = getDb()
    .prepare(
      "SELECT manifest_key, subagent_a2a_context_id FROM dove_agent_contexts WHERE orchestrator_session_id = ?",
    )
    .all(orchestratorSessionId);
  const result = new Map<string, string>();
  for (const row of rows) {
    const k = row.manifest_key;
    const v = row.subagent_a2a_context_id;
    if (typeof k === "string" && typeof v === "string") result.set(k, v);
  }
  return result;
}

export function deleteOrchestratorAgentContexts(orchestratorSessionId: string): void {
  getDb()
    .prepare("DELETE FROM dove_agent_contexts WHERE orchestrator_session_id = ?")
    .run(orchestratorSessionId);
}
