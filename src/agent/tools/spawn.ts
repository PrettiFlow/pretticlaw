import { Tool } from "./base.js";
import type { SubagentManager } from "../subagent.js";

export class SpawnTool extends Tool {
  readonly name = "spawn";
  readonly description = "Spawn a subagent to handle a task in the background.";
  readonly parameters = {
    type: "object",
    properties: {
      task: { type: "string", description: "The task for the subagent to complete" },
      label: { type: "string", description: "Optional short label" },
    },
    required: ["task"],
  };

  private originChannel = "cli";
  private originChatId = "direct";
  private sessionKey = "cli:direct";

  constructor(private readonly manager: SubagentManager) { super(); }

  setContext(channel: string, chatId: string): void {
    this.originChannel = channel;
    this.originChatId = chatId;
    this.sessionKey = `${channel}:${chatId}`;
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    return this.manager.spawn({
      task: String(args.task ?? ""),
      label: args.label != null ? String(args.label) : null,
      originChannel: this.originChannel,
      originChatId: this.originChatId,
      sessionKey: this.sessionKey,
    });
  }
}
