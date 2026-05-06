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
    const result = withMemoryReminder("do the thing", "/some/dir");
    expect(result).toContain("do the thing");
    expect(result).toContain("ASKS A QUESTION NOT ABOUT THIS AGENT");
    expect(result).toContain("/some/dir/memory/MEMORY.md");
    expect(result).toContain("you MUST START the agent");
  });

  it("uses hard-gate MUST language", () => {
    const result = withMemoryReminder("do the thing", "/some/dir");
    expect(result).toContain("MUST");
    expect(result).toContain("NEVER skip");
  });

  it("instructs agent to skip to NOT SUFFICIENT when MEMORY.md does not exist", () => {
    const result = withMemoryReminder("do the thing", "/some/dir");
    expect(result).toContain("does not exist");
    expect(result).toContain("NOT SUFFICIENT");
  });

  it("requires entire response to be the exact escalation sentence", () => {
    const result = withMemoryReminder("do the thing", "/some/dir");
    expect(result).toContain("ENTIRE response MUST be this exact sentence");
    expect(result).toContain("no preamble, no explanation, no extra words");
  });
});
