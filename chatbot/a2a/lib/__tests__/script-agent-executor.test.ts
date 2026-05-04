/**
 * Tests for ScriptAgentExecutor helpers — verifies that the instruction from
 * the A2A userMessage is correctly extracted and forwarded as argv[2].
 */

import { describe, expect, it } from "vitest";

// These are pure functions — no mocks needed.
import { extractInstruction } from "../message-parts";
import { buildScriptArgs } from "../spawn";
import { startRunScriptToolName, buildSubAgentPrompt } from "@/lib/agent-script-tools";
import { buildSubAgentReminder } from "@@/lib/subagent-reminder";
import type { AgentDef } from "@@/lib/agents";
import { Bot } from "lucide-react";

const minimalAgent = {
  name: "test-agent",
  alias: "ta",
  manifestKey: "test_agent",
  toolName: "yolo_test_agent",
  label: "Claude Code Agent - Test Agent",
  displayName: "Test Agent",
  description: "A test agent",
  entryPath: "agent-local/test-agent/main.ts",
  schedulingEnabled: false,
  icon: Bot,
  iconBg: "bg-secondary",
  iconColor: "text-muted-foreground",
  doveCard: {
    title: "Test",
    description: "Test",
    prompt: "",
    icon: Bot,
    iconBg: "bg-secondary",
    iconColor: "text-muted-foreground",
  },
  suggestions: [],
} satisfies AgentDef;

const startScriptTool = startRunScriptToolName("test_agent");

describe("extractInstruction", () => {
  it("returns text from a single text part", () => {
    expect(extractInstruction([{ kind: "text", text: "P1AB1234 example.com:zone123" }])).toBe(
      "P1AB1234 example.com:zone123",
    );
  });

  it("joins multiple text parts with a space", () => {
    expect(
      extractInstruction([
        { kind: "text", text: "incidents today" },
        { kind: "text", text: "example.com:abc123" },
      ]),
    ).toBe("incidents today example.com:abc123");
  });

  it("returns empty string when there are no parts", () => {
    expect(extractInstruction([])).toBe("");
  });

  it("returns empty string when the only text part is empty", () => {
    expect(extractInstruction([{ kind: "text", text: "" }])).toBe("");
  });

  it("ignores non-text parts", () => {
    expect(
      extractInstruction([
        { kind: "data", text: "ignored" },
        { kind: "text", text: "incidents today" },
      ]),
    ).toBe("incidents today");
  });

  it("trims surrounding whitespace", () => {
    expect(extractInstruction([{ kind: "text", text: "  incidents today  " }])).toBe(
      "incidents today",
    );
  });
});

describe("QueryAgentExecutor prompt fallback", () => {
  it("uses instruction as prompt when non-empty", () => {
    const instruction = "incidents today";
    expect(instruction || startScriptTool).toBe("incidents today");
  });

  it("falls back to startRunScriptToolName when instruction is empty", () => {
    const instruction = "";
    expect(instruction || startScriptTool).toBe(startScriptTool);
  });

  it("startRunScriptToolName returns a non-empty string that includes the manifestKey", () => {
    expect(typeof startScriptTool).toBe("string");
    expect(startScriptTool).toBe("start_test_agent");
  });
});

describe("buildScriptArgs", () => {
  it("includes instruction as argv[2] when non-empty", () => {
    expect(buildScriptArgs("/app/agent.ts", "P1AB1234")).toEqual(["/app/agent.ts", "P1AB1234"]);
  });

  it("omits argv[2] when instruction is empty string", () => {
    expect(buildScriptArgs("/app/agent.ts", "")).toEqual(["/app/agent.ts"]);
  });

  it("always puts scriptPath first", () => {
    const args = buildScriptArgs("/some/path.ts", "run");
    expect(args[0]).toBe("/some/path.ts");
  });
});

describe("buildSubAgentPrompt doveDisplayName", () => {
  it("defaults to Dove when doveDisplayName is omitted", () => {
    const result = buildSubAgentPrompt(minimalAgent);
    expect(result).toContain("Dove");
  });

  it("uses provided doveDisplayName in default personality", () => {
    const result = buildSubAgentPrompt(minimalAgent, "Aria");
    expect(result).toContain("Aria");
    expect(result).not.toContain("one of Dove's mice");
  });

  it("agent personality overrides default and ignores doveDisplayName", () => {
    const agent: AgentDef = { ...minimalAgent, personality: "Custom personality." };
    const result = buildSubAgentPrompt(agent, "Aria");
    expect(result).toContain("Custom personality.");
    expect(result).not.toContain("Aria's mice");
  });
});

describe("buildSubAgentReminder memory check", () => {
  it("injects ASKING A QUESTION bullet when memoryDir is provided", () => {
    const result = buildSubAgentReminder(undefined, "/state/.my-agent", "start_my_agent");
    expect(result).toContain("/state/.my-agent/memory/MEMORY.md");
    expect(result).toContain("ASKING A QUESTION");
    expect(result).toContain("start_my_agent");
  });

  it("memory bullet appears inside the reminder tag", () => {
    const result = buildSubAgentReminder(undefined, "/state/.my-agent", "start_my_agent");
    const reminderIdx = result.indexOf("<reminder>");
    const bulletIdx = result.indexOf("ASKING A QUESTION");
    expect(bulletIdx).toBeGreaterThan(reminderIdx);
  });

  it("omits memory bullet when memoryDir is absent", () => {
    const result = buildSubAgentReminder();
    expect(result).not.toContain("ASKING A QUESTION");
  });
});
