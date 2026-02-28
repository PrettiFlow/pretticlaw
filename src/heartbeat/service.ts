import fs from "node:fs";
import path from "node:path";
import type { LLMProvider } from "../providers/base.js";

const HEARTBEAT_TOOL = [{
  type: "function",
  function: {
    name: "heartbeat",
    description: "Report heartbeat decision after reviewing tasks.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["skip", "run"] },
        tasks: { type: "string" },
      },
      required: ["action"],
    },
  },
}];

export class HeartbeatService {
  private running = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly workspace: string,
    private readonly provider: LLMProvider,
    private readonly model: string,
    private readonly onExecute?: (tasks: string) => Promise<string>,
    private readonly onNotify?: (response: string) => Promise<void>,
    private readonly intervalS = 1800,
    private readonly enabled = true,
  ) {}

  private get heartbeatFile(): string {
    return path.join(this.workspace, "HEARTBEAT.md");
  }

  private readHeartbeat(): string | null {
    if (!fs.existsSync(this.heartbeatFile)) return null;
    const text = fs.readFileSync(this.heartbeatFile, "utf8");
    return text.trim() ? text : null;
  }

  private async decide(content: string): Promise<{ action: "skip" | "run"; tasks: string }> {
    const response = await this.provider.chat({
      model: this.model,
      messages: [
        { role: "system", content: "You are a heartbeat agent. Call the heartbeat tool to report your decision." },
        { role: "user", content: `Review the following HEARTBEAT.md and decide whether there are active tasks.\n\n${content}` },
      ],
      tools: HEARTBEAT_TOOL,
    });
    if (!response.toolCalls.length) return { action: "skip", tasks: "" };
    const args = response.toolCalls[0].arguments;
    const action = args.action === "run" ? "run" : "skip";
    const tasks = typeof args.tasks === "string" ? args.tasks : "";
    return { action, tasks };
  }

  async start(): Promise<void> {
    if (!this.enabled || this.running) return;
    this.running = true;
    this.schedule();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    if (!this.running) return;
    this.timer = setTimeout(() => void this.tick().finally(() => this.schedule()), this.intervalS * 1000);
  }

  private async tick(): Promise<void> {
    const content = this.readHeartbeat();
    if (!content) return;
    const { action, tasks } = await this.decide(content);
    if (action !== "run") return;
    if (!this.onExecute) return;
    const response = await this.onExecute(tasks);
    if (response && this.onNotify) await this.onNotify(response);
  }

  async triggerNow(): Promise<string | null> {
    const content = this.readHeartbeat();
    if (!content) return null;
    const { action, tasks } = await this.decide(content);
    if (action !== "run" || !this.onExecute) return null;
    return this.onExecute(tasks);
  }
}
