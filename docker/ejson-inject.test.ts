import { describe, expect, it } from "vitest";
import { buildExports } from "./ejson-inject.mjs";

describe("buildExports", () => {
  it("returns empty string for empty environment", () => {
    expect(buildExports({})).toBe("");
  });

  it("prints export lines for environment keys", () => {
    const out = buildExports({ environment: { API_KEY: "sk-test", TOKEN: "abc123" } });
    expect(out).toContain('export API_KEY="sk-test"\n');
    expect(out).toContain('export TOKEN="abc123"\n');
  });

  it("skips keys starting with _", () => {
    const out = buildExports({ environment: { SECRET: "val", _internal: "skip" } });
    expect(out).toContain('export SECRET="val"\n');
    expect(out).not.toContain("_internal");
  });

  it("skips top-level _public_key (not in environment)", () => {
    const out = buildExports({ _public_key: "abc", environment: { KEY: "val" } });
    expect(out).toContain('export KEY="val"\n');
    expect(out).not.toContain("_public_key");
  });

  it("handles missing environment key gracefully", () => {
    expect(buildExports({ _public_key: "abc" })).toBe("");
  });
});
