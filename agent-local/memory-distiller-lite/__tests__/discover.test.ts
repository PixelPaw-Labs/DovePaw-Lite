import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { discoverAgentMemories } from "../discover.js";

vi.mock("@dovepaw/agent-sdk", () => ({
  agentPersistentStateDir: (name: string) => join(_stateRoot, `.${name}`),
}));

let _stateRoot: string;

function makeDir(): string {
  const dir = join(tmpdir(), `discover-test-${randomBytes(4).toString("hex")}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeMemory(
  stateRoot: string,
  agentName: string,
  content: string,
  topics: Record<string, string> = {},
) {
  const memoryDir = join(stateRoot, `.${agentName}`, "memory");
  mkdirSync(memoryDir, { recursive: true });
  writeFileSync(join(memoryDir, "MEMORY.md"), content);
  for (const [name, body] of Object.entries(topics)) {
    writeFileSync(join(memoryDir, name), body);
  }
}

describe("discoverAgentMemories", () => {
  let agentSettingsDir: string;

  beforeEach(() => {
    agentSettingsDir = makeDir();
    _stateRoot = makeDir();
  });

  afterEach(() => {
    rmSync(agentSettingsDir, { recursive: true, force: true });
    rmSync(_stateRoot, { recursive: true, force: true });
  });

  it("returns empty array when settings dir does not exist", () => {
    const result = discoverAgentMemories("/nonexistent/path", new Set());
    expect(result).toEqual([]);
  });

  it("returns empty array when no agents have memory files", () => {
    mkdirSync(join(agentSettingsDir, "my-agent"));
    const result = discoverAgentMemories(agentSettingsDir, new Set());
    expect(result).toEqual([]);
  });

  it("returns memory info for agents that have a MEMORY.md", () => {
    mkdirSync(join(agentSettingsDir, "my-agent"));
    writeMemory(_stateRoot, "my-agent", "# Agent Memory: my-agent\n\n- some entry");

    const result = discoverAgentMemories(agentSettingsDir, new Set());
    expect(result).toHaveLength(1);
    expect(result[0].agentName).toBe("my-agent");
    expect(result[0].memoryContent).toContain("some entry");
    expect(result[0].topicFiles).toEqual([]);
  });

  it("includes topic files from the memory directory", () => {
    mkdirSync(join(agentSettingsDir, "my-agent"));
    writeMemory(_stateRoot, "my-agent", "# Memory", {
      "feedback_foo.md": "---\nname: foo\n---\n\nDo not do X.",
      "user_bar.md": "---\nname: bar\n---\n\nUser is a developer.",
    });

    const result = discoverAgentMemories(agentSettingsDir, new Set());
    expect(result[0].topicFiles).toHaveLength(2);
    const names = result[0].topicFiles.map((t) => t.name).toSorted();
    expect(names).toEqual(["feedback_foo.md", "user_bar.md"]);
  });

  it("excludes agents in the excludeNames set", () => {
    mkdirSync(join(agentSettingsDir, "memory-dream-lite"));
    mkdirSync(join(agentSettingsDir, "memory-distiller-lite"));
    mkdirSync(join(agentSettingsDir, "my-agent"));
    writeMemory(_stateRoot, "memory-dream-lite", "# Memory");
    writeMemory(_stateRoot, "my-agent", "# Memory: my-agent\n\n- learning");

    const result = discoverAgentMemories(
      agentSettingsDir,
      new Set(["memory-dream-lite", "memory-distiller-lite"]),
    );
    expect(result).toHaveLength(1);
    expect(result[0].agentName).toBe("my-agent");
  });

  it("skips agents whose MEMORY.md is empty", () => {
    mkdirSync(join(agentSettingsDir, "empty-agent"));
    writeMemory(_stateRoot, "empty-agent", "");

    const result = discoverAgentMemories(agentSettingsDir, new Set());
    expect(result).toEqual([]);
  });

  it("skips topic files that are empty", () => {
    mkdirSync(join(agentSettingsDir, "my-agent"));
    writeMemory(_stateRoot, "my-agent", "# Memory", {
      "feedback_nonempty.md": "some content",
      "feedback_empty.md": "",
    });

    const result = discoverAgentMemories(agentSettingsDir, new Set());
    expect(result[0].topicFiles).toHaveLength(1);
    expect(result[0].topicFiles[0].name).toBe("feedback_nonempty.md");
  });

  it("does not include MEMORY.md itself in topicFiles", () => {
    mkdirSync(join(agentSettingsDir, "my-agent"));
    writeMemory(_stateRoot, "my-agent", "# Memory\n\n- entry");

    const result = discoverAgentMemories(agentSettingsDir, new Set());
    expect(result[0].topicFiles.map((t) => t.name)).not.toContain("MEMORY.md");
  });
});
