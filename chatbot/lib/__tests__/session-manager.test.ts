import { describe, it, expect, vi, beforeEach } from "vitest";
import { join } from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const TMP_DIR = join(tmpdir(), `dovepaw-session-manager-test-${process.pid}`);
vi.mock("@@/lib/paths", () => ({ DOVEPAW_DIR: TMP_DIR }));

const { SessionManager } = await import("../session-manager");
const {
  getSessionDetail,
  getSessionResumable,
  setOrchestratorAgentContext,
  getOrchestratorAgentContexts,
  deleteOrchestratorAgentContexts,
  closeDb,
} = await import("../db-lite");

beforeEach(() => mkdirSync(TMP_DIR, { recursive: true }));

afterEach(() => {
  closeDb();
  rmSync(TMP_DIR, { recursive: true, force: true });
});

// ─── getSessionResumable ─────────────────────────────────────────────────────

describe("getSessionResumable", () => {
  it("returns null when session has no subagentSessionId", () => {
    SessionManager.save("agent-x", "ctx-r1", { output: "", progress: [] }, { label: "L" });
    expect(getSessionResumable("ctx-r1", "agent-x")).toBeNull();
  });

  it("returns resumable data when subagentSessionId and workspacePath are stored", () => {
    SessionManager.save(
      "agent-x",
      "ctx-r2",
      { output: "", progress: [] },
      {
        label: "My Label",
        subagentSessionId: "sess-abc",
        workspacePath: "/tmp/ws",
      },
    );
    const r = getSessionResumable("ctx-r2", "agent-x");
    expect(r?.subagentSessionId).toBe("sess-abc");
    expect(r?.workspacePath).toBe("/tmp/ws");
    expect(r?.label).toBe("My Label");
  });

  it("returns null for unknown contextId", () => {
    expect(getSessionResumable("no-such-ctx", "agent-x")).toBeNull();
  });
});

// ─── Orchestrator context ─────────────────────────────────────────────────────

describe("setOrchestratorAgentContext / getOrchestratorAgentContexts", () => {
  it("stores and retrieves context entries", () => {
    setOrchestratorAgentContext("dove-1", "agent-alpha", "ctx-alpha");
    setOrchestratorAgentContext("dove-1", "agent-beta", "ctx-beta");
    const map = getOrchestratorAgentContexts("dove-1");
    expect(map.get("agent-alpha")).toBe("ctx-alpha");
    expect(map.get("agent-beta")).toBe("ctx-beta");
  });

  it("updates existing entry on conflict", () => {
    setOrchestratorAgentContext("dove-2", "agent-alpha", "ctx-old");
    setOrchestratorAgentContext("dove-2", "agent-alpha", "ctx-new");
    expect(getOrchestratorAgentContexts("dove-2").get("agent-alpha")).toBe("ctx-new");
  });

  it("returns empty map for unknown session", () => {
    expect(getOrchestratorAgentContexts("nonexistent")).toEqual(new Map());
  });
});

describe("deleteOrchestratorAgentContexts", () => {
  it("removes all contexts for a session", () => {
    setOrchestratorAgentContext("dove-3", "agent-x", "ctx-x");
    deleteOrchestratorAgentContexts("dove-3");
    expect(getOrchestratorAgentContexts("dove-3")).toEqual(new Map());
  });
});

// ─── SessionManager.restore ───────────────────────────────────────────────────

describe("SessionManager.restore", () => {
  it("is a no-op when contextId not in DB", () => {
    const manager = new SessionManager();
    manager.restore("unknown-ctx", "agent-x");
    expect(manager.get("unknown-ctx")).toBeUndefined();
  });

  it("is a no-op when subagentSessionId not set", () => {
    SessionManager.save("agent-x", "ctx-no-sess", { output: "", progress: [] }, { label: "L" });
    const manager = new SessionManager();
    manager.restore("ctx-no-sess", "agent-x");
    expect(manager.get("ctx-no-sess")).toBeUndefined();
  });

  it("is a no-op when workspace path does not exist on disk", () => {
    SessionManager.save(
      "agent-x",
      "ctx-bad-ws",
      { output: "", progress: [] },
      {
        label: "L",
        subagentSessionId: "sess-xyz",
        workspacePath: "/does/not/exist/at/all",
      },
    );
    const manager = new SessionManager();
    manager.restore("ctx-bad-ws", "agent-x");
    expect(manager.get("ctx-bad-ws")).toBeUndefined();
  });

  it("restores session when DB has resume data and workspace exists", () => {
    const workspacePath = join(TMP_DIR, "ws-restore");
    mkdirSync(workspacePath, { recursive: true });
    SessionManager.save(
      "agent-x",
      "ctx-restore",
      { output: "", progress: [] },
      {
        label: "Restored",
        subagentSessionId: "sess-xyz",
        workspacePath,
      },
    );
    const manager = new SessionManager();
    manager.restore("ctx-restore", "agent-x");
    const state = manager.get("ctx-restore");
    expect(state?.subagentSessionId).toBe("sess-xyz");
    expect(state?.label).toBe("Restored");
  });

  it("skips DB load when contextId already in memory", () => {
    const workspacePath = join(TMP_DIR, "ws-loaded");
    mkdirSync(workspacePath, { recursive: true });
    SessionManager.save(
      "agent-x",
      "ctx-loaded",
      { output: "", progress: [] },
      {
        label: "L",
        subagentSessionId: "sess-abc",
        workspacePath,
      },
    );
    const manager = new SessionManager();
    manager.restore("ctx-loaded", "agent-x");
    const first = manager.get("ctx-loaded");
    manager.restore("ctx-loaded", "agent-x");
    expect(manager.get("ctx-loaded")).toBe(first);
  });
});

// ─── SessionManager.save ─────────────────────────────────────────────────────

describe("SessionManager.save", () => {
  it("persists messages and progress to db", () => {
    SessionManager.save(
      "test-agent",
      "ctx-1",
      { output: "done", progress: [{ message: "Bash", artifacts: { "tool-call": "Bash" } }] },
      { label: "My label", userText: "user text" },
    );
    const detail = getSessionDetail("ctx-1");
    expect(detail).not.toBeNull();
    expect(detail!.agentId).toBe("test-agent");
    expect(detail!.label).toBe("My label");
    expect(detail!.messages).toHaveLength(2);
    expect(detail!.messages[0]).toMatchObject({
      role: "user",
      segments: [{ type: "text", content: "user text" }],
    });
    expect(detail!.messages[1]).toMatchObject({
      role: "assistant",
      segments: [{ type: "text", content: "done" }],
    });
    expect(detail!.progress).toEqual([{ message: "Bash", artifacts: { "tool-call": "Bash" } }]);
  });

  it("uses provided assistantMsg instead of building from result.output", () => {
    const assistantMsg = {
      id: "msg-id",
      role: "assistant" as const,
      segments: [{ type: "text" as const, content: "custom text" }],
      processContent: "thinking content",
    };
    SessionManager.save(
      "test-agent",
      "ctx-3",
      { output: "ignored output", progress: [] },
      { label: "label", userText: "user", assistantMsg },
    );
    const detail = getSessionDetail("ctx-3");
    expect(detail!.messages[1].segments).toEqual([{ type: "text", content: "custom text" }]);
    expect(detail!.messages[1].processContent).toBe("thinking content");
  });
});

// ─── SessionManager.makePersistence ──────────────────────────────────────────

describe("SessionManager.makePersistence", () => {
  it("saves result.output as assistant message text", () => {
    const persistence = SessionManager.makePersistence("test-agent");
    persistence.save("ctx-4", { output: "agent output", progress: [] });
    const detail = getSessionDetail("ctx-4");
    expect(detail!.messages[1]).toMatchObject({
      role: "assistant",
      segments: [{ type: "text", content: "agent output" }],
    });
    expect(detail!.messages[1].processContent).toBeUndefined();
  });

  it("saves processContent when provided", () => {
    const persistence = SessionManager.makePersistence("test-agent");
    persistence.save("ctx-5", { output: "output", progress: [] }, "thinking text");
    const detail = getSessionDetail("ctx-5");
    expect(detail!.messages[1].processContent).toBe("thinking text");
    expect(detail!.messages[1].segments).toEqual([{ type: "text", content: "output" }]);
  });

  it("saves progress entries", () => {
    const persistence = SessionManager.makePersistence("test-agent");
    persistence.save("ctx-6", {
      output: "x",
      progress: [
        { message: "Read", artifacts: { "tool-call": "Read" } },
        { message: "Bash", artifacts: { "tool-call": "Bash" } },
      ],
    });
    const detail = getSessionDetail("ctx-6");
    expect(detail!.progress).toHaveLength(2);
    expect(detail!.progress[0].message).toBe("Read");
    expect(detail!.progress[1].message).toBe("Bash");
  });
});
