import { describe, it, expect } from "vitest";
import { buildPrompt } from "../main.js";

describe("buildPrompt", () => {
  it("invokes the support-agent skill", () => {
    expect(buildPrompt("how do I reset my password")).toBe(
      'Skill("/support-agent how do I reset my password")',
    );
  });

  it("passes instruction through unmodified", () => {
    const msg = "Category: account. Message: I cannot log in";
    expect(buildPrompt(msg)).toBe(`Skill("/support-agent ${msg}")`);
  });

  it("handles empty instruction", () => {
    expect(buildPrompt("")).toBe('Skill("/support-agent ")');
  });
});
