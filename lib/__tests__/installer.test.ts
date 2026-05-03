import { describe, it, expect, vi, beforeEach } from "vitest";
import { access, copyFile, chmod } from "node:fs/promises";
import { exec, type ExecException } from "node:child_process";

// Mock node modules before importing the module under test
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined), // used by deployTriggerScript internally
  access: vi.fn().mockResolvedValue(undefined),
  copyFile: vi.fn().mockResolvedValue(undefined),
  chmod: vi.fn().mockResolvedValue(undefined),
  cp: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  readFile: vi.fn().mockResolvedValue(""),
  writeFile: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockResolvedValue({ mtime: new Date() }),
  symlink: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("node:child_process", () => ({
  exec: vi.fn(),
  execSync: vi.fn().mockReturnValue(Buffer.from("1000")),
}));

vi.mock("node:util", () => ({
  promisify: vi.fn((fn) => {
    return (...args: unknown[]) =>
      new Promise((resolve, reject) => {
        fn(...args, (err: Error | null, result: unknown) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
  }),
}));

describe("deployAgentSdk", () => {
  let deployAgentSdk: () => Promise<void>;
  let symlinkMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import("../installer.js");
    deployAgentSdk = mod.deployAgentSdk;
    const fs = await import("node:fs/promises");
    symlinkMock = vi.mocked(fs.symlink);
  });

  it("symlinks @openai/codex-sdk and @anthropic-ai/claude-agent-sdk", async () => {
    await deployAgentSdk();

    const targets = symlinkMock.mock.calls.map((args) => String(args[1]));
    expect(targets.some((t) => t.includes("codex-sdk"))).toBe(true);
    expect(targets.some((t) => t.includes("claude-agent-sdk"))).toBe(true);
  });
});

describe("linkLocalAgentSkills", () => {
  let linkLocalAgentSkills: () => Promise<void>;
  let symlinkMock: ReturnType<typeof vi.fn>;
  let rmMock: ReturnType<typeof vi.fn>;
  let readdirMock: ReturnType<typeof vi.fn>;
  let accessMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import("../installer.js");
    linkLocalAgentSkills = mod.linkLocalAgentSkills;
    const fs = await import("node:fs/promises");
    symlinkMock = vi.mocked(fs.symlink);
    rmMock = vi.mocked(fs.rm);
    readdirMock = vi.mocked(fs.readdir);
    accessMock = vi.mocked(fs.access);
  });

  it("no-ops silently when agent-local/ does not exist", async () => {
    readdirMock.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    await linkLocalAgentSkills();
    expect(symlinkMock).not.toHaveBeenCalled();
  });

  it("skips agent dirs that have no skill/ subdir", async () => {
    readdirMock.mockResolvedValue([{ name: "my-agent", isDirectory: () => true }]);
    accessMock.mockRejectedValue(new Error("ENOENT"));
    await linkLocalAgentSkills();
    expect(symlinkMock).not.toHaveBeenCalled();
  });

  it("symlinks skill/ into ~/.claude/skills/<name>", async () => {
    readdirMock.mockResolvedValue([{ name: "my-agent", isDirectory: () => true }]);
    accessMock.mockResolvedValue(undefined);
    await linkLocalAgentSkills();
    const dests = symlinkMock.mock.calls.map((args) => String(args[1]));
    expect(dests.some((d) => d.includes(".claude/skills") && d.endsWith("my-agent"))).toBe(true);
  });

  it("symlinks skill/ into ~/.codex/skills/<name>", async () => {
    readdirMock.mockResolvedValue([{ name: "my-agent", isDirectory: () => true }]);
    accessMock.mockResolvedValue(undefined);
    await linkLocalAgentSkills();
    const dests = symlinkMock.mock.calls.map((args) => String(args[1]));
    expect(dests.some((d) => d.includes(".codex/skills") && d.endsWith("my-agent"))).toBe(true);
  });

  it("removes existing link before symlinking", async () => {
    readdirMock.mockResolvedValue([{ name: "my-agent", isDirectory: () => true }]);
    accessMock.mockResolvedValue(undefined);
    await linkLocalAgentSkills();
    const rmPaths = rmMock.mock.calls.map((args) => String(args[0]));
    expect(rmPaths.some((p) => p.includes(".claude/skills") && p.endsWith("my-agent"))).toBe(true);
    expect(rmPaths.some((p) => p.includes(".codex/skills") && p.endsWith("my-agent"))).toBe(true);
  });
});

describe("linkAgentSdkToAgentLocal", () => {
  let linkAgentSdkToAgentLocal: () => Promise<void>;
  let symlinkMock: ReturnType<typeof vi.fn>;
  let rmMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import("../installer.js");
    linkAgentSdkToAgentLocal = mod.linkAgentSdkToAgentLocal;
    const fs = await import("node:fs/promises");
    symlinkMock = vi.mocked(fs.symlink);
    rmMock = vi.mocked(fs.rm);
  });

  it("symlinks AGENT_SDK_DIR into agent-local/node_modules/@dovepaw/agent-sdk", async () => {
    await linkAgentSdkToAgentLocal();
    const dests = symlinkMock.mock.calls.map((args) => String(args[1]));
    expect(dests.some((d) => d.includes("agent-local") && d.endsWith("agent-sdk"))).toBe(true);
  });

  it("removes existing link before symlinking", async () => {
    await linkAgentSdkToAgentLocal();
    const rmPaths = rmMock.mock.calls.map((args) => String(args[0]));
    expect(rmPaths.some((p) => p.includes("agent-local") && p.endsWith("agent-sdk"))).toBe(true);
  });
});

describe("deployTriggerScript", () => {
  let deployTriggerScript: () => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import("../installer.js");
    deployTriggerScript = mod.deployTriggerScript;
  });

  it("copies the trigger script directly when dist file exists", async () => {
    vi.mocked(access).mockResolvedValue(undefined);

    await deployTriggerScript();

    expect(exec).not.toHaveBeenCalled();
    expect(copyFile).toHaveBeenCalledOnce();
    expect(chmod).toHaveBeenCalledOnce();
  });

  it("runs npm run build before copying when dist file is missing", async () => {
    vi.mocked(access).mockRejectedValue(new Error("ENOENT"));
    vi.mocked(exec).mockImplementation((_cmd, _opts, cb) => {
      (cb as unknown as (err: ExecException | null, stdout: string, stderr: string) => void)(
        null,
        "",
        "",
      );
      return {} as ReturnType<typeof exec>;
    });

    await deployTriggerScript();

    expect(exec).toHaveBeenCalledWith(
      "npm run build",
      expect.objectContaining({ cwd: expect.stringContaining("DovePaw-Lite") }),
      expect.any(Function),
    );
    expect(copyFile).toHaveBeenCalledOnce();
    expect(chmod).toHaveBeenCalledOnce();
  });

  it("concurrent calls run the underlying deploy only once", async () => {
    vi.mocked(access).mockResolvedValue(undefined);

    await Promise.all([deployTriggerScript(), deployTriggerScript(), deployTriggerScript()]);

    expect(copyFile).toHaveBeenCalledOnce();
    expect(chmod).toHaveBeenCalledOnce();
  });
});

describe("syncClaudeRules", () => {
  let syncClaudeRules: () => Promise<void>;
  let readdirMock: ReturnType<typeof vi.fn>;
  let accessMock: ReturnType<typeof vi.fn>;
  let mkdirMock: ReturnType<typeof vi.fn>;
  let copyFileMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import("../installer.js");
    syncClaudeRules = mod.syncClaudeRules;
    const fs = await import("node:fs/promises");
    readdirMock = vi.mocked(fs.readdir);
    accessMock = vi.mocked(fs.access);
    mkdirMock = vi.mocked(fs.mkdir);
    copyFileMock = vi.mocked(fs.copyFile);
  });

  it("no-ops silently when .claude/rules/ does not exist", async () => {
    readdirMock.mockRejectedValue(new Error("ENOENT"));
    await syncClaudeRules();
    expect(copyFileMock).not.toHaveBeenCalled();
  });

  it("creates CLAUDE_RULES_ROOT before copying", async () => {
    readdirMock.mockResolvedValue([{ name: "security.md", isFile: () => true }]);
    accessMock.mockRejectedValue(new Error("ENOENT"));
    await syncClaudeRules();
    const mkdirPaths = mkdirMock.mock.calls.map((args) => String(args[0]));
    expect(mkdirPaths.some((p) => p.endsWith(".claude/rules"))).toBe(true);
  });

  it("copies a rules file when it does not yet exist at the destination", async () => {
    readdirMock.mockResolvedValue([{ name: "security.md", isFile: () => true }]);
    accessMock.mockRejectedValue(new Error("ENOENT"));
    await syncClaudeRules();
    const [src, dest] = copyFileMock.mock.calls[0] as [string, string];
    expect(src).toMatch(/\.claude[/\\]rules[/\\]security\.md$/);
    expect(dest).toMatch(/\.claude[/\\]rules[/\\]security\.md$/);
  });

  it("skips a rules file that already exists at the destination", async () => {
    readdirMock.mockResolvedValue([{ name: "security.md", isFile: () => true }]);
    accessMock.mockResolvedValue(undefined); // file already present
    await syncClaudeRules();
    expect(copyFileMock).not.toHaveBeenCalled();
  });

  it("skips non-file entries", async () => {
    readdirMock.mockResolvedValue([{ name: "subdir", isFile: () => false }]);
    await syncClaudeRules();
    expect(copyFileMock).not.toHaveBeenCalled();
  });
});
