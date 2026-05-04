import { describe, it, expect } from "vitest";
import { buildSubAgentReminder, SUBAGENT_PROMPT_REMINDER } from "@@/lib/subagent-reminder";

describe("buildSubAgentReminder", () => {
  describe("start mode (isAskMode = false / undefined)", () => {
    it("returns the default reminder when no extra is given", () => {
      expect(buildSubAgentReminder()).toBe(SUBAGENT_PROMPT_REMINDER);
    });

    it("injects extra inside the reminder tag", () => {
      const result = buildSubAgentReminder("- do the thing");
      expect(result).toContain("- do the thing");
      expect(result).toContain("</reminder>");
    });
  });

  describe("ask mode (isAskMode = true)", () => {
    it("returns empty reminder when no memoryDir or extra", () => {
      const result = buildSubAgentReminder(undefined, undefined, undefined, true);
      expect(result).toBe("<reminder>\n</reminder>");
    });

    it("includes memory bullet scoped to questions NOT about this agent", () => {
      const result = buildSubAgentReminder(undefined, "/some/dir", "start_foo", true);
      expect(result).toContain("ASKING A QUESTION NOT ABOUT THIS AGENT");
      expect(result).toContain("/some/dir/memory/MEMORY.md");
      expect(result).toContain("start_foo");
    });

    it("does NOT contain the old ambiguous 'question IS about this agent' wording", () => {
      const result = buildSubAgentReminder(undefined, "/some/dir", "start_foo", true);
      expect(result).not.toContain("question IS about this agent");
    });

    it("falls back to 'the start tool' when startToolName is omitted", () => {
      const result = buildSubAgentReminder(undefined, "/some/dir", undefined, true);
      expect(result).toContain("the start tool");
    });

    it("combines extra and memory bullet", () => {
      const result = buildSubAgentReminder("- extra bullet", "/some/dir", "start_foo", true);
      expect(result).toContain("- extra bullet");
      expect(result).toContain("ASKING A QUESTION NOT ABOUT THIS AGENT");
    });

    it("omits memory bullet when memoryDir is not provided", () => {
      const result = buildSubAgentReminder("- extra bullet", undefined, undefined, true);
      expect(result).toContain("- extra bullet");
      expect(result).not.toContain("MEMORY.md");
    });
  });
});
