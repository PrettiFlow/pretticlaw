import { describe, expect, test } from "vitest";
import { Tool } from "../src/agent/tools/base.js";
import { ToolRegistry } from "../src/agent/tools/registry.js";

class SampleTool extends Tool {
  readonly name = "sample";
  readonly description = "sample tool";
  readonly parameters = {
    type: "object",
    properties: {
      query: { type: "string", minLength: 2 },
      count: { type: "integer", minimum: 1, maximum: 10 },
      mode: { type: "string", enum: ["fast", "full"] },
      meta: {
        type: "object",
        properties: {
          tag: { type: "string" },
          flags: { type: "array", items: { type: "string" } },
        },
        required: ["tag"],
      },
    },
    required: ["query", "count"],
  };
  async execute(): Promise<string> { return "ok"; }
}

describe("tool validation", () => {
  test("missing required", () => {
    const tool = new SampleTool();
    const errors = tool.validateParams({ query: "hi" });
    expect(errors.join("; ")).toContain("missing required count");
  });

  test("type and range", () => {
    const tool = new SampleTool();
    expect(tool.validateParams({ query: "hi", count: 0 }).some((e) => e.includes("count must be >= 1"))).toBe(true);
    expect(tool.validateParams({ query: "hi", count: "2" as any }).some((e) => e.includes("count should be integer"))).toBe(true);
  });

  test("enum and min length", () => {
    const tool = new SampleTool();
    const errors = tool.validateParams({ query: "h", count: 2, mode: "slow" });
    expect(errors.some((e) => e.includes("query must be at least 2 chars"))).toBe(true);
    expect(errors.some((e) => e.includes("mode must be one of"))).toBe(true);
  });

  test("nested object and array", () => {
    const tool = new SampleTool();
    const errors = tool.validateParams({ query: "hi", count: 2, meta: { flags: [1, "ok"] } });
    expect(errors.some((e) => e.includes("missing required meta.tag"))).toBe(true);
    expect(errors.some((e) => e.includes("meta.flags[0] should be string"))).toBe(true);
  });

  test("registry returns validation error", async () => {
    const reg = new ToolRegistry();
    reg.register(new SampleTool());
    const result = await reg.execute("sample", { query: "hi" });
    expect(result).toContain("Invalid parameters");
  });
});
