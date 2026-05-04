import { describe, expect, it } from "vitest";
import { ALWAYS_DISALLOWED_TOOLS, bashHasWriteOperation } from "./security-policy.js";

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
