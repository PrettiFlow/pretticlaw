import { randomUUID } from "node:crypto";
import type { MessageBus } from "../bus/queue.js";
import type { LLMProvider } from "../providers/base.js";
import type { InboundMessage } from "../bus/events.js";
import { ToolRegistry } from "./tools/registry.js";
import { ReadFileTool, WriteFileTool, EditFileTool, ListDirTool } from "./tools/filesystem.js";
import { ExecTool } from "./tools/shell.js";
import { WebSearchTool, WebFetchTool } from "./tools/web.js";

export class SubagentManager {
  private running = new Map<string, Promise<void>>();
  private sessionTasks = new Map<string, Set<string>>();

  constructor(
    private readonly provider: LLMProvider,
    private readonly workspace: string,
    private readonly bus: MessageBus,
    private readonly model: string,
    private readonly temperature: number,
    private readonly maxTokens: number,
    private readonly braveApiKey: string | null,
    private readonly execConfig: { timeout: number; pathAppend: string },
    private readonly restrictToWorkspace: boolean,
  ) {}

  async spawn(input: { task: string; label: string | null; originChannel: string; originChatId: string; sessionKey: string }): Promise<string> {
    const taskId = randomUUID().slice(0, 8);
    const label = input.label ?? (input.task.length > 30 ? `${input.task.slice(0, 30)}...` : input.task);

    const p = this.runSubagent(taskId, input.task, label, { channel: input.originChannel, chatId: input.originChatId })
      .finally(() => {
        this.running.delete(taskId);
        const ids = this.sessionTasks.get(input.sessionKey);
        if (ids) {
          ids.delete(taskId);
          if (!ids.size) this.sessionTasks.delete(input.sessionKey);
        }
      });

    this.running.set(taskId, p);
    if (!this.sessionTasks.has(input.sessionKey)) this.sessionTasks.set(input.sessionKey, new Set());
    this.sessionTasks.get(input.sessionKey)!.add(taskId);

    return `Subagent [${label}] started (id: ${taskId}). I'll notify you when it completes.`;
  }

  private async runSubagent(taskId: string, task: string, label: string, origin: { channel: string; chatId: string }): Promise<void> {
    const tools = new ToolRegistry();
    const allowedDir = this.restrictToWorkspace ? this.workspace : undefined;
    tools.register(new ReadFileTool(this.workspace, allowedDir));
    tools.register(new WriteFileTool(this.workspace, allowedDir));
    tools.register(new EditFileTool(this.workspace, allowedDir));
    tools.register(new ListDirTool(this.workspace, allowedDir));
    tools.register(new ExecTool(this.execConfig.timeout, this.workspace, this.restrictToWorkspace, this.execConfig.pathAppend));
    tools.register(new WebSearchTool(this.braveApiKey));
    tools.register(new WebFetchTool());

    let messages: Array<Record<string, unknown>> = [
      { role: "system", content: this.buildSubagentPrompt() },
      { role: "user", content: task },
    ];

    let finalResult = "Task completed but no final response was generated.";
    for (let i = 0; i < 15; i++) {
      const response = await this.provider.chat({ messages, tools: tools.getDefinitions(), model: this.model, temperature: this.temperature, maxTokens: this.maxTokens });
      if (response.toolCalls.length) {
        messages.push({ role: "assistant", content: response.content ?? "", tool_calls: response.toolCalls.map((tc) => ({ id: tc.id, type: "function", function: { name: tc.name, arguments: JSON.stringify(tc.arguments) } })) });
        for (const tc of response.toolCalls) {
          const result = await tools.execute(tc.name, tc.arguments);
          messages.push({ role: "tool", tool_call_id: tc.id, name: tc.name, content: result });
        }
      } else {
        finalResult = response.content ?? finalResult;
        break;
      }
    }

    const announceContent = `[Subagent '${label}' completed successfully]\n\nTask: ${task}\n\nResult:\n${finalResult}\n\nSummarize this naturally for the user. Keep it brief (1-2 sentences).`;
    const msg: InboundMessage = { channel: "system", senderId: "subagent", chatId: `${origin.channel}:${origin.chatId}`, content: announceContent };
    await this.bus.publishInbound(msg);
  }

  private buildSubagentPrompt(): string {
    const now = new Date().toLocaleString();
    return `# Subagent\n\nCurrent Time: ${now}\n\nYou are a subagent spawned by the main agent to complete a specific task. Stay focused and concise.`;
  }

  async cancelBySession(sessionKey: string): Promise<number> {
    const ids = [...(this.sessionTasks.get(sessionKey) ?? [])];
    return ids.filter((id) => this.running.has(id)).length;
  }

  getRunningCount(): number {
    return this.running.size;
  }
}
