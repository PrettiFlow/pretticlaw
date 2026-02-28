import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, expect, test } from "vitest";
import { ContextBuilder } from "../src/agent/context.js";

describe("context runtime separation", () => {
  test("runtime context is separate untrusted user message", () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "pretticlaw-ctx-"));
    fs.writeFileSync(path.join(workspace, "AGENTS.md"), "agent", "utf8");
    const ctx = new ContextBuilder(workspace);
    const messages = ctx.buildMessages({ history: [], currentMessage: "Return exactly: OK", channel: "cli", chatId: "direct" });

    expect(messages[0].role).toBe("system");
    expect(String(messages[0].content)).not.toContain("## Current Session");

    const runtimeContent = String(messages[messages.length - 2].content);
    expect(messages[messages.length - 2].role).toBe("user");
    expect(runtimeContent).toContain(ContextBuilder.RUNTIME_CONTEXT_TAG);
    expect(runtimeContent).toContain("Current Time:");
    expect(runtimeContent).toContain("Channel: cli");
    expect(runtimeContent).toContain("Chat ID: direct");

    expect(messages[messages.length - 1].role).toBe("user");
    expect(messages[messages.length - 1].content).toBe("Return exactly: OK");
  });
});
