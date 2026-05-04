import { describe, it, expect } from "vitest";
import {
  buildSubAgentReminder,
  withMemoryReminder,
  SUBAGENT_PROMPT_REMINDER,
} from "@@/lib/subagent-reminder";

describe("buildSubAgentReminder", () => {
  it("returns the default reminder when no extra is given", () => {
    expect(buildSubAgentReminder()).toBe(SUBAGENT_PROMPT_REMINDER);
  });

  it("injects extra inside the reminder tag", () => {
    const result = buildSubAgentReminder("- do the thing");
    expect(result).toContain("- do the thing");
    expect(result).toContain("</reminder>");
  });
});

describe("withMemoryReminder", () => {
  it("returns instruction unchanged when memoryDir is absent", () => {
    expect(withMemoryReminder("do the thing")).toBe("do the thing");
  });

  it("appends memory bullet when memoryDir is provided", () => {
    const result = withMemoryReminder("do the thing", "/some/dir", "start_foo");
    expect(result).toContain("do the thing");
    expect(result).toContain("ASKING A QUESTION NOT ABOUT THIS AGENT");
    expect(result).toContain("/some/dir/memory/MEMORY.md");
    expect(result).toContain("start_foo");
  });

  it("falls back to 'the start tool' when startToolName is omitted", () => {
    const result = withMemoryReminder("do the thing", "/some/dir");
    expect(result).toContain("the start tool");
  });

  it("uses hard-gate MUST language", () => {
    const result = withMemoryReminder("do the thing", "/some/dir", "start_foo");
    expect(result).toContain("MUST");
    expect(result).toContain("NEVER skip");
  });
});
