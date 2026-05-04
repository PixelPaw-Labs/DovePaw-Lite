import { describe, it, expect } from "vitest";
import { buildPrompt } from "../main.js";

describe("buildPrompt", () => {
  it("invokes the escalation-agent skill", () => {
    expect(buildPrompt("Message: I am furious. Confidence: 1")).toBe(
      'Skill("/escalation-agent Message: I am furious. Confidence: 1")',
    );
  });

  it("passes full context through unmodified", () => {
    const ctx = "Message: charge dispute. Confidence: 2. Draft: We can help.";
    expect(buildPrompt(ctx)).toBe(`Skill("/escalation-agent ${ctx}")`);
  });

  it("handles empty instruction", () => {
    expect(buildPrompt("")).toBe('Skill("/escalation-agent ")');
  });
});
