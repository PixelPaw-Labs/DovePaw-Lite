import { describe, it, expect } from "vitest";
import { buildSkillArgs } from "../main.js";

describe("buildSkillArgs", () => {
  it("includes ticket as first key=value pair", () => {
    expect(buildSkillArgs("EC-1007", "")).toBe('ticket="EC-1007"');
  });

  it("appends non-empty instruction after ticket", () => {
    expect(buildSkillArgs("EC-1007", "dry-run")).toBe('ticket="EC-1007" dry-run');
  });

  it("omits empty instruction", () => {
    expect(buildSkillArgs("EC-1007", "")).toBe('ticket="EC-1007"');
  });

  it("uses the provided ticket key verbatim", () => {
    expect(buildSkillArgs("PROJ-999", "")).toBe('ticket="PROJ-999"');
  });
});
