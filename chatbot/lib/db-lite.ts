import type { SessionMessage } from "@/lib/message-types";
import { mergeProgress } from "@/lib/progress";
import type { ProgressEntry } from "@/lib/progress";

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

export interface GroupMessage {
  id: string;
  agentId: string;
  startedAt: string;
  groupMessage: string;
}

// ─── In-memory store ─────────────────────────────────────────────────────────

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

export function closeDb(): void {}

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
}


export function getSessionStatus(id: string): SessionStatus | null {
  return sessions.get(id)?.status ?? null;
}

export function setSessionStatus(id: string, status: SessionStatus): void {
  const s = sessions.get(id);
  if (s) s.status = status;
}

export function closeStaleSessions(): void {}

export function getSessionResumable(_id: string, _agentId: string): SessionResumable | null {
  return null;
}

export function getSessionDetail(id: string): SessionDetail | null {
  const s = sessions.get(id);
  if (!s) return null;
  return { ...s };
}

export function getSessionWorkspacePath(_id: string): string | null {
  return null;
}

export function getAllSessionWorkspacePaths(): string[] {
  return [];
}

export function deleteSession(id: string): void {
  sessions.delete(id);
}

export function deleteAllSessions(): void {
  sessions.clear();
}

export function setGroupMessage(_sessionId: string, _text: string): void {}

export function getGroupMessages(_agentIds: string[]): GroupMessage[] {
  return [];
}

export function setOrchestratorAgentContext(
  _orchestratorSessionId: string,
  _manifestKey: string,
  _subagentA2aContextId: string,
): void {}

export function getOrchestratorAgentContexts(_orchestratorSessionId: string): Map<string, string> {
  return new Map();
}

export function deleteOrchestratorAgentContexts(_orchestratorSessionId: string): void {}
