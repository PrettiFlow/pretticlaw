import path from "node:path";
import { ContextBuilder } from "./context.js";
import { MemoryStore } from "./memory.js";
import { SubagentManager } from "./subagent.js";
import { ReadFileTool, WriteFileTool, EditFileTool, ListDirTool } from "./tools/filesystem.js";
import { ExecTool } from "./tools/shell.js";
import { WebSearchTool, WebFetchTool } from "./tools/web.js";
import { MessageTool } from "./tools/message.js";
import { SpawnTool } from "./tools/spawn.js";
import { CronTool } from "./tools/cron.js";
import { ToolRegistry } from "./tools/registry.js";
import type { MessageBus } from "../bus/queue.js";
import type { InboundMessage, OutboundMessage } from "../bus/events.js";
import { sessionKey as getSessionKey } from "../bus/events.js";
import type { LLMProvider } from "../providers/base.js";
import { SessionManager, type Session } from "../session/manager.js";
import type { CronService } from "../cron/service.js";

function stripThink(text: string | null): string | null {
  if (!text) return null;
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim() || null;
}

type ProgressFn = (content: string, meta?: { toolHint?: boolean; tool_calls?: any[] }) => Promise<void>;

export class AgentLoop {
  private readonly context: ContextBuilder;
  private readonly sessions: SessionManager;
  readonly tools: ToolRegistry;
  readonly subagents: SubagentManager;
  private running = false;
  private readonly consolidating = new Set<string>();
  private readonly activeTasks = new Map<string, Set<Promise<void>>>();
  private processing = Promise.resolve();
  private static readonly TOOL_RESULT_MAX_CHARS = 500;

  constructor(private readonly input: {
    bus: MessageBus;
    provider: LLMProvider;
    workspace: string;
    model?: string;
    maxIterations?: number;
    temperature?: number;
    maxTokens?: number;
    memoryWindow?: number;
    braveApiKey?: string | null;
    execConfig?: { timeout: number; pathAppend: string };
    cronService?: CronService;
    restrictToWorkspace?: boolean;
    sessionManager?: SessionManager;
    channelsConfig?: { sendProgress: boolean; sendToolHints: boolean };
  }) {
    const workspace = path.resolve(input.workspace);
    this.context = new ContextBuilder(workspace);
    this.sessions = input.sessionManager ?? new SessionManager(workspace);
    this.tools = new ToolRegistry();

    const model = input.model ?? input.provider.getDefaultModel();
    this.subagents = new SubagentManager(
      input.provider,
      workspace,
      input.bus,
      model,
      input.temperature ?? 0.1,
      input.maxTokens ?? 4096,
      input.braveApiKey ?? null,
      input.execConfig ?? { timeout: 60, pathAppend: "" },
      !!input.restrictToWorkspace,
    );

    this.registerDefaultTools();
  }

  get model(): string {
    return this.input.model ?? this.input.provider.getDefaultModel();
  }

  get channelsConfig(): { sendProgress: boolean; sendToolHints: boolean } | undefined {
    return this.input.channelsConfig;
  }

  private registerDefaultTools(): void {
    const workspace = path.resolve(this.input.workspace);
    const allowed = this.input.restrictToWorkspace ? workspace : undefined;
    this.tools.register(new ReadFileTool(workspace, allowed));
    this.tools.register(new WriteFileTool(workspace, allowed));
    this.tools.register(new EditFileTool(workspace, allowed));
    this.tools.register(new ListDirTool(workspace, allowed));
    this.tools.register(new ExecTool(this.input.execConfig?.timeout ?? 60, workspace, !!this.input.restrictToWorkspace, this.input.execConfig?.pathAppend ?? ""));
    this.tools.register(new WebSearchTool(this.input.braveApiKey ?? null));
    this.tools.register(new WebFetchTool());
    this.tools.register(new MessageTool((msg) => this.input.bus.publishOutbound(msg)));
    this.tools.register(new SpawnTool(this.subagents));
    if (this.input.cronService) this.tools.register(new CronTool(this.input.cronService));
  }

  private setToolContext(channel: string, chatId: string, messageId?: string): void {
    const message = this.tools.get("message");
    if (message && message instanceof MessageTool) message.setContext(channel, chatId, messageId);
    const spawn = this.tools.get("spawn") as any;
    if (spawn?.setContext) spawn.setContext(channel, chatId);
    const cron = this.tools.get("cron") as any;
    if (cron?.setContext) cron.setContext(channel, chatId);
  }

  private toolHint(toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>): string {
    return toolCalls.map((tc) => {
      const val = Object.values(tc.arguments ?? {})[0];
      if (typeof val !== "string") return tc.name;
      return val.length > 40 ? `${tc.name}("${val.slice(0, 40)}...")` : `${tc.name}("${val}")`;
    }).join(", ");
  }

  private async runAgentLoop(initialMessages: Array<Record<string, unknown>>, onProgress?: ProgressFn): Promise<{ finalContent: string | null; toolsUsed: string[]; messages: Array<Record<string, unknown>> }> {
    const messages = [...initialMessages];
    let finalContent: string | null = null;
    const toolsUsed: string[] = [];
    const maxIterations = this.input.maxIterations ?? 40;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const response = await this.input.provider.chat({
        messages,
        tools: this.tools.getDefinitions(),
        model: this.model,
        temperature: this.input.temperature ?? 0.1,
        maxTokens: this.input.maxTokens ?? 4096,
      });

      if (response.toolCalls.length) {
        if (onProgress) {
          const clean = stripThink(response.content);
          if (clean) await onProgress(clean, { toolHint: false });
          await onProgress(this.toolHint(response.toolCalls), { toolHint: true });
        }

        const toolCallDicts = response.toolCalls.map((tc) => ({ id: tc.id, type: "function", function: { name: tc.name, arguments: JSON.stringify(tc.arguments) } }));
        this.context.addAssistantMessage(messages, response.content, toolCallDicts, response.reasoningContent);

        for (const call of response.toolCalls) {
          toolsUsed.push(call.name);
          const result = await this.tools.execute(call.name, call.arguments);
          this.context.addToolResult(messages, call.id, call.name, result);
        }
      } else {
        finalContent = stripThink(response.content);
        this.context.addAssistantMessage(messages, finalContent, undefined, response.reasoningContent);
        break;
      }
    }

    if (finalContent == null) {
      finalContent = `I reached the maximum number of tool call iterations (${maxIterations}) without completing the task.`;
    }

    return { finalContent, toolsUsed, messages };
  }

  async run(): Promise<void> {
    this.running = true;
    while (this.running) {
      const msg = await this.input.bus.consumeInbound();
      if (msg.content.trim().toLowerCase() === "/stop") {
        await this.handleStop(msg);
        continue;
      }
      const session = getSessionKey(msg);
      const task = this.dispatch(msg).finally(() => {
        const set = this.activeTasks.get(session);
        if (!set) return;
        set.delete(task);
        if (!set.size) this.activeTasks.delete(session);
      });
      if (!this.activeTasks.has(session)) this.activeTasks.set(session, new Set());
      this.activeTasks.get(session)!.add(task);
    }
  }

  stop(): void {
    this.running = false;
  }

  async processDirect(content: string, session = "cli:direct", channel = "cli", chatId = "direct", onProgress?: ProgressFn): Promise<string> {
    const msg: InboundMessage = { channel, senderId: "user", chatId, content };
    const out = await this.processMessage(msg, session, onProgress);
    return out?.content ?? "";
  }

  private async dispatch(msg: InboundMessage): Promise<void> {
    this.processing = this.processing.then(async () => {
      try {
        const response = await this.processMessage(msg);
        if (response) {
          await this.input.bus.publishOutbound(response);
        } else if (msg.channel === "cli") {
          await this.input.bus.publishOutbound({ channel: msg.channel, chatId: msg.chatId, content: "", metadata: msg.metadata ?? {} });
        }
      } catch {
        await this.input.bus.publishOutbound({ channel: msg.channel, chatId: msg.chatId, content: "Sorry, I encountered an error." });
      }
    });
    return this.processing;
  }

  private async handleStop(msg: InboundMessage): Promise<void> {
    const key = getSessionKey(msg);
    const tasks = [...(this.activeTasks.get(key) ?? [])];
    const subCancelled = await this.subagents.cancelBySession(key);
    const total = tasks.length + subCancelled;
    await this.input.bus.publishOutbound({ channel: msg.channel, chatId: msg.chatId, content: total ? `Stopped ${total} task(s).` : "No active task to stop." });
  }

  private async consolidateMemory(session: Session, archiveAll = false): Promise<boolean> {
    return new MemoryStore(this.input.workspace).consolidate(session, this.input.provider, this.model, { archiveAll, memoryWindow: this.input.memoryWindow ?? 100 });
  }

  private saveTurn(session: Session, messages: Array<Record<string, unknown>>, skip: number): void {
    for (const m of messages.slice(skip)) {
      const entry: Record<string, unknown> = { ...m };
      delete entry.reasoning_content;
      if (entry.role === "tool" && typeof entry.content === "string" && entry.content.length > AgentLoop.TOOL_RESULT_MAX_CHARS) {
        entry.content = `${entry.content.slice(0, AgentLoop.TOOL_RESULT_MAX_CHARS)}\n... (truncated)`;
      }
      if (entry.role === "user" && typeof entry.content === "string" && entry.content.startsWith(ContextBuilder.RUNTIME_CONTEXT_TAG)) continue;
      if (!entry.timestamp) entry.timestamp = new Date().toISOString();
      session.messages.push(entry as any);
    }
    session.updatedAt = new Date().toISOString();
  }

  async processMessage(msg: InboundMessage, sessionKeyOverride?: string, onProgress?: ProgressFn): Promise<OutboundMessage | null> {
    if (msg.channel === "system") {
      const [channel, chatId] = String(msg.chatId).includes(":") ? String(msg.chatId).split(/:(.*)/s, 2) : ["cli", String(msg.chatId)];
      const key = `${channel}:${chatId}`;
      const session = this.sessions.getOrCreate(key);
      this.setToolContext(channel, chatId, msg.metadata?.message_id as string | undefined);
      const history = session.getHistory(this.input.memoryWindow ?? 100);
      const messages = this.context.buildMessages({ history, currentMessage: msg.content, channel, chatId });
      const { finalContent, messages: allMsgs } = await this.runAgentLoop(messages);
      this.saveTurn(session, allMsgs, 1 + history.length);
      this.sessions.save(session);
      return { channel, chatId, content: finalContent ?? "Background task completed." };
    }

    const key = sessionKeyOverride ?? getSessionKey(msg);
    const session = this.sessions.getOrCreate(key);
    const cmd = msg.content.trim().toLowerCase();

    if (cmd === "/new") {
      if (session.messages.length) {
        const ok = await this.consolidateMemory(session, true);
        if (!ok) return { channel: msg.channel, chatId: msg.chatId, content: "Memory archival failed, session not cleared. Please try again." };
      }
      session.clear();
      this.sessions.save(session);
      this.sessions.invalidate(session.key);
      return { channel: msg.channel, chatId: msg.chatId, content: "New session started." };
    }

    if (cmd === "/help") {
      return { channel: msg.channel, chatId: msg.chatId, content: "pretticlaw commands:\n/new - Start a new conversation\n/stop - Stop the current task\n/help - Show available commands" };
    }

    const unconsolidated = session.messages.length - session.lastConsolidated;
    if (unconsolidated >= (this.input.memoryWindow ?? 100) && !this.consolidating.has(session.key)) {
      this.consolidating.add(session.key);
      void this.consolidateMemory(session).finally(() => this.consolidating.delete(session.key));
    }

    this.setToolContext(msg.channel, msg.chatId, msg.metadata?.message_id as string | undefined);
    const messageTool = this.tools.get("message");
    if (messageTool instanceof MessageTool) messageTool.startTurn();

    const history = session.getHistory(this.input.memoryWindow ?? 100);
    const initialMessages = this.context.buildMessages({ history, currentMessage: msg.content, media: msg.media, channel: msg.channel, chatId: msg.chatId });

    const busProgress: ProgressFn = async (content, meta) => {
      const metadata = { ...(msg.metadata ?? {}), _progress: true, _tool_hint: !!meta?.toolHint } as Record<string, unknown>;
      await this.input.bus.publishOutbound({ channel: msg.channel, chatId: msg.chatId, content, metadata });
    };

    const { finalContent, messages: allMsgs } = await this.runAgentLoop(initialMessages, onProgress ?? busProgress);
    const out = finalContent ?? "I've completed processing but have no response to give.";

    this.saveTurn(session, allMsgs, 1 + history.length);
    this.sessions.save(session);

    if (messageTool instanceof MessageTool && messageTool.sentInTurn) return null;

    return { channel: msg.channel, chatId: msg.chatId, content: out, metadata: msg.metadata ?? {} };
  }
}
