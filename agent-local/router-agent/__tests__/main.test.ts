import { describe, it, expect } from "vitest";
import { buildPrompt } from "../main.js";

describe("buildPrompt", () => {
  it("invokes the router-agent skill", () => {
    expect(buildPrompt("my order is missing")).toBe('Skill("/router-agent my order is missing")');
  });

  it("passes instruction through unmodified", () => {
    const msg = "I need a refund for order #12345";
    expect(buildPrompt(msg)).toBe(`Skill("/router-agent ${msg}")`);
  });

  it("handles empty instruction", () => {
    expect(buildPrompt("")).toBe('Skill("/router-agent ")');
  });
});
