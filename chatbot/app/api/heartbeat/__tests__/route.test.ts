import { describe, expect, it } from "vitest";
import { z } from "zod";

// ─── Schema under test (extracted from route.ts for unit testing) ─────────────
// These match the definitions in route.ts exactly.

const processingStateSchema = z.record(
  z.string(),
  z.object({
    processing: z.boolean(),
    processingTrigger: z.union([z.literal("scheduled"), z.literal("dove")]).nullable(),
  }),
);
type ProcessingState = z.infer<typeof processingStateSchema>;
const EMPTY_PROCESSING: ProcessingState = {};

function parseProcessingState(raw: unknown): ProcessingState {
  const result = processingStateSchema.safeParse(raw);
  return result.success ? result.data : EMPTY_PROCESSING;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("processingStateSchema", () => {
  it("accepts a valid processing state with scheduled trigger", () => {
    const input = {
      my_agent: { processing: true, processingTrigger: "scheduled" },
    };
    const result = processingStateSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.my_agent?.processing).toBe(true);
      expect(result.data.my_agent?.processingTrigger).toBe("scheduled");
    }
  });

  it("accepts a valid processing state with dove trigger", () => {
    const input = {
      my_agent: { processing: false, processingTrigger: "dove" },
    };
    const result = processingStateSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("accepts null processingTrigger", () => {
    const input = {
      my_agent: { processing: false, processingTrigger: null },
    };
    const result = processingStateSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.my_agent?.processingTrigger).toBeNull();
    }
  });

  it("accepts multiple agents", () => {
    const input = {
      agent_a: { processing: true, processingTrigger: "scheduled" },
      agent_b: { processing: false, processingTrigger: null },
    };
    const result = processingStateSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejects unknown processingTrigger values", () => {
    const input = {
      my_agent: { processing: true, processingTrigger: "unknown_trigger" },
    };
    const result = processingStateSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects missing processing field", () => {
    const input = {
      my_agent: { processingTrigger: null },
    };
    const result = processingStateSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects non-object top-level input", () => {
    expect(processingStateSchema.safeParse(null).success).toBe(false);
    expect(processingStateSchema.safeParse("string").success).toBe(false);
    expect(processingStateSchema.safeParse(42).success).toBe(false);
  });
});

describe("parseProcessingState", () => {
  it("returns parsed state for valid input", () => {
    const input = {
      my_agent: { processing: true, processingTrigger: "scheduled" },
    };
    expect(parseProcessingState(input)).toEqual(input);
  });

  it("returns empty object for invalid input", () => {
    expect(parseProcessingState(null)).toEqual(EMPTY_PROCESSING);
    expect(parseProcessingState("bad")).toEqual(EMPTY_PROCESSING);
    expect(parseProcessingState({ agent: { processing: "yes" } })).toEqual(EMPTY_PROCESSING);
  });

  it("returns empty object for unknown trigger values", () => {
    const input = {
      my_agent: { processing: true, processingTrigger: "rogue" },
    };
    expect(parseProcessingState(input)).toEqual(EMPTY_PROCESSING);
  });
});
