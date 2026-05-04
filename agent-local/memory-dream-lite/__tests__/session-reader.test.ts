import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { parseSessionFile, listSessionFiles, discoverWorkspaceSlugs } from "../session-reader.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDir(): string {
  const dir = join(tmpdir(), `session-reader-${randomBytes(4).toString("hex")}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeLine(dir: string, file: string, ...lines: object[]): string {
  const p = join(dir, file);
  writeFileSync(p, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return p;
}

const RECENT = new Date(Date.now() - 60 * 1000).toISOString(); // 1 min ago
const OLD = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 48h ago
const SINCE = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 24h ago

// ─── parseSessionFile ─────────────────────────────────────────────────────────

describe("parseSessionFile", () => {
  let dir: string;
  beforeEach(() => {
    dir = makeDir();
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns null when no messages fall within the time window", () => {
    const p = writeLine(dir, "s.jsonl", {
      type: "user",
      timestamp: OLD,
      cwd: "/x",
      gitBranch: "main",
      message: { role: "user", content: [{ type: "text", text: "hello" }] },
    });
    expect(parseSessionFile(p, SINCE)).toBeNull();
  });

  it("returns messages that are within the time window", () => {
    const p = writeLine(dir, "s.jsonl", {
      type: "user",
      timestamp: RECENT,
      cwd: "/x",
      gitBranch: "main",
      message: { role: "user", content: [{ type: "text", text: "hello" }] },
    });
    const result = parseSessionFile(p, SINCE);
    expect(result).not.toBeNull();
    expect(result!.messages).toHaveLength(1);
    expect(result!.messages[0].content).toBe("hello");
    expect(result!.messages[0].role).toBe("user");
  });

  it("captures cwd and gitBranch even when the entry is before the time window", () => {
    const p = writeLine(
      dir,
      "s.jsonl",
      {
        type: "user",
        timestamp: OLD,
        cwd: "/my/repo",
        gitBranch: "feat/x",
        message: { role: "user", content: [{ type: "text", text: "old" }] },
      },
      {
        type: "user",
        timestamp: RECENT,
        message: { role: "user", content: [{ type: "text", text: "new" }] },
      },
    );
    const result = parseSessionFile(p, SINCE);
    expect(result).not.toBeNull();
    expect(result!.cwd).toBe("/my/repo");
    expect(result!.gitBranch).toBe("feat/x");
    expect(result!.messages).toHaveLength(1);
    expect(result!.messages[0].content).toBe("new");
  });

  it("extracts text from array content", () => {
    const p = writeLine(dir, "s.jsonl", {
      type: "assistant",
      timestamp: RECENT,
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "..." },
          { type: "text", text: "the answer" },
        ],
      },
    });
    const result = parseSessionFile(p, SINCE);
    expect(result!.messages[0].content).toBe("the answer");
  });

  it("skips entries with empty text content", () => {
    const p = writeLine(
      dir,
      "s.jsonl",
      {
        type: "assistant",
        timestamp: RECENT,
        message: { role: "assistant", content: [{ type: "thinking", thinking: "hidden" }] },
      },
      {
        type: "user",
        timestamp: RECENT,
        message: { role: "user", content: [{ type: "text", text: "visible" }] },
      },
    );
    const result = parseSessionFile(p, SINCE);
    expect(result!.messages).toHaveLength(1);
    expect(result!.messages[0].content).toBe("visible");
  });

  it("skips non-user/assistant entry types", () => {
    const p = writeLine(
      dir,
      "s.jsonl",
      { type: "queue-operation", operation: "enqueue", timestamp: RECENT },
      {
        type: "user",
        timestamp: RECENT,
        message: { role: "user", content: [{ type: "text", text: "hi" }] },
      },
    );
    const result = parseSessionFile(p, SINCE);
    expect(result!.messages).toHaveLength(1);
  });

  it("skips malformed JSON lines without throwing", () => {
    const p = join(dir, "bad.jsonl");
    writeFileSync(
      p,
      "not json\n" +
        JSON.stringify({
          type: "user",
          timestamp: RECENT,
          message: { role: "user", content: [{ type: "text", text: "ok" }] },
        }) +
        "\n",
    );
    const result = parseSessionFile(p, SINCE);
    expect(result!.messages).toHaveLength(1);
  });
});

// ─── listSessionFiles ─────────────────────────────────────────────────────────

describe("listSessionFiles", () => {
  let root: string;
  beforeEach(() => {
    root = makeDir();
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns jsonl file paths in a slug directory", () => {
    const slugDir = join(root, "my-slug");
    mkdirSync(slugDir);
    writeFileSync(join(slugDir, "abc.jsonl"), "");
    writeFileSync(join(slugDir, "def.jsonl"), "");
    writeFileSync(join(slugDir, "notes.md"), "");
    const files = listSessionFiles(root, "my-slug");
    expect(files).toHaveLength(2);
    expect(files.every((f) => f.endsWith(".jsonl"))).toBe(true);
  });

  it("returns empty array when slug directory does not exist", () => {
    expect(listSessionFiles(root, "missing-slug")).toEqual([]);
  });
});

// ─── discoverWorkspaceSlugs ───────────────────────────────────────────────────

describe("discoverWorkspaceSlugs", () => {
  let root: string;
  beforeEach(() => {
    root = makeDir();
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("finds slugs matching the agent workspace pattern", () => {
    mkdirSync(join(root, "-Users-foo--dovepaw-lite-workspaces--my-agent-ma-abc123"));
    mkdirSync(join(root, "-Users-foo--dovepaw-lite-workspaces--my-agent-ma-def456"));
    mkdirSync(join(root, "-Users-foo--dovepaw-lite-workspaces--other-agent-oa-xyz"));
    const slugs = discoverWorkspaceSlugs(root, "my-agent");
    expect(slugs).toHaveLength(2);
    expect(slugs.every((s) => s.includes("-workspaces--my-agent-"))).toBe(true);
  });

  it("returns empty array when projects dir does not exist", () => {
    expect(discoverWorkspaceSlugs("/nonexistent/path", "my-agent")).toEqual([]);
  });

  it("returns empty array when no slugs match the agent", () => {
    mkdirSync(join(root, "-Users-foo--dovepaw-lite-workspaces--other-agent-oa-xyz"));
    expect(discoverWorkspaceSlugs(root, "my-agent")).toEqual([]);
  });
});
