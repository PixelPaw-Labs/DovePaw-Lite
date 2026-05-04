import { describe, expect, it } from "vitest";
import {
  ALWAYS_DISALLOWED_TOOLS,
  bashHasWriteOperation,
  getSecurityModeStrategy,
} from "./security-policy.js";

describe("getSecurityModeStrategy", () => {
  it("read-only: permissionMode is default (blocks writes at SDK level)", () => {
    const s = getSecurityModeStrategy("read-only");
    expect(s.permissionMode).toBe("default");
    expect(s.readOnly).toBe(true);
    expect(s.allowDangerouslySkipPermissions).toBe(false);
  });

  it("read-only: disallowedTools includes file write and shell write tools", () => {
    const s = getSecurityModeStrategy("read-only");
    expect(s.disallowedTools).toContain("Write");
    expect(s.disallowedTools).toContain("Edit");
    expect(s.disallowedTools).toContain("Bash(rm *)");
    expect(s.disallowedTools).toContain("Bash(mkdir *)");
  });

  it("supervised: permissionMode is acceptEdits, no disallowedTools", () => {
    const s = getSecurityModeStrategy("supervised");
    expect(s.permissionMode).toBe("acceptEdits");
    expect(s.readOnly).toBe(false);
    expect(s.disallowedTools).toHaveLength(0);
  });

  it("autonomous: permissionMode is bypassPermissions, allowDangerouslySkipPermissions true", () => {
    const s = getSecurityModeStrategy("autonomous");
    expect(s.permissionMode).toBe("bypassPermissions");
    expect(s.allowDangerouslySkipPermissions).toBe(true);
    expect(s.readOnly).toBe(false);
    expect(s.disallowedTools).toHaveLength(0);
  });

  it("sub-agent read-only disallowedTools + ALWAYS_DISALLOWED_TOOLS covers write and service tools", () => {
    const modeTools = getSecurityModeStrategy("read-only").disallowedTools;
    const merged = [...modeTools, ...ALWAYS_DISALLOWED_TOOLS];
    expect(merged).toContain("Write");
    expect(merged).toContain("mcp__claude_ai_Gmail__*");
  });
});

describe("ALWAYS_DISALLOWED_TOOLS", () => {
  it("uses glob * syntax, not regex .* syntax", () => {
    for (const pattern of ALWAYS_DISALLOWED_TOOLS) {
      expect(pattern, `pattern "${pattern}" uses regex .* instead of glob *`).not.toMatch(/\.\*/);
    }
  });

  it("blocks all expected claude.ai MCP service groups", () => {
    const expected = [
      "mcp__claude_ai_Assets__*",
      "mcp__claude_ai_Gmail__*",
      "mcp__claude_ai_Google_Calendar__*",
      "mcp__claude_ai_Google_Drive__*",
      "mcp__claude_ai_Google_Sheets__*",
      "mcp__claude_ai_HubSpot__*",
      "mcp__claude_ai_Jira__*",
      "mcp__claude_ai_Confluence__*",
      "mcp__claude_ai_Slack__*",
      "mcp__claude_ai_Slack_Workato__*",
      "mcp__claude_ai_Envato_Creative_Companion__*",
    ];
    for (const pattern of expected) {
      expect(ALWAYS_DISALLOWED_TOOLS).toContain(pattern);
    }
  });
});

describe("bashHasWriteOperation", () => {
  it("detects shell redirect writes", () => {
    expect(bashHasWriteOperation("echo hello > file.txt")).toBe(true);
    expect(bashHasWriteOperation("cat data >> log.txt")).toBe(true);
  });

  it("detects sed in-place edits", () => {
    expect(bashHasWriteOperation("sed -i 's/foo/bar/' file.txt")).toBe(true);
  });

  it("ignores redirects inside quoted strings", () => {
    expect(bashHasWriteOperation('echo "hello > world"')).toBe(false);
    expect(bashHasWriteOperation("echo 'a > b'")).toBe(false);
  });

  it("allows read-only commands", () => {
    expect(bashHasWriteOperation("cat file.txt")).toBe(false);
    expect(bashHasWriteOperation("grep pattern file.txt")).toBe(false);
    expect(bashHasWriteOperation("ls -la")).toBe(false);
  });
});
