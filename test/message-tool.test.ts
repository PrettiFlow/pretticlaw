import { describe, expect, test } from "vitest";
import { MessageTool } from "../src/agent/tools/message.js";

describe("message tool", () => {
  test("returns error when no target context", async () => {
    const tool = new MessageTool();
    const result = await tool.execute({ content: "test" });
    expect(result).toBe("Error: No target channel/chat specified");
  });
});
