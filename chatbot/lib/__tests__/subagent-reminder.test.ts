import { describe, it, expect } from "vitest";
import {
  buildSubAgentReminder,
  withMemoryReminder,
  SUBAGENT_PROMPT_REMINDER,
} from "@@/lib/subagent-reminder";

describe("buildSubAgentReminder", () => {
  it("returns the default reminder when no extra is given", () => {
    const result = buildSubAgentReminder();
    expect(result).toContain("ALWAYS call `start_*` first");
    expect(result).not.toContain("{{extra}}");
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
    expect(result).toContain("Answer a question without reading memory first");
    expect(result).toContain("/some/dir/memory/MEMORY.md");
    expect(result).toContain("you MUST START the agent");
  });

  it("uses hard-gate MUST language", () => {
    const result = withMemoryReminder("do the thing", "/some/dir");
    expect(result).toContain("MUST");
    expect(result).toContain("ALWAYS read");
  });

  it("escalates when memory is missing or incomplete", () => {
    const result = withMemoryReminder("do the thing", "/some/dir");
    expect(result).toContain("missing, incomplete");
    expect(result).toContain("ENTIRE response MUST be this exact sentence");
  });
});
