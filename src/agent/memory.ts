import fs from "node:fs";
import path from "node:path";
import type { LLMProvider } from "../providers/base.js";
import type { Session } from "../session/manager.js";

const SAVE_MEMORY_TOOL = [{
  type: "function",
  function: {
    name: "save_memory",
    description: "Save the memory consolidation result to persistent storage.",
    parameters: {
      type: "object",
      properties: {
        history_entry: { type: "string" },
        memory_update: { type: "string" },
      },
      required: ["history_entry", "memory_update"],
    },
  },
}];

export class MemoryStore {
  readonly memoryDir: string;
  readonly memoryFile: string;
  readonly historyFile: string;

  constructor(workspace: string) {
    this.memoryDir = path.join(workspace, "memory");
    fs.mkdirSync(this.memoryDir, { recursive: true });
    this.memoryFile = path.join(this.memoryDir, "MEMORY.md");
    this.historyFile = path.join(this.memoryDir, "HISTORY.md");
  }

  readLongTerm(): string {
    return fs.existsSync(this.memoryFile) ? fs.readFileSync(this.memoryFile, "utf8") : "";
  }

  writeLongTerm(content: string): void {
    fs.writeFileSync(this.memoryFile, content, "utf8");
  }

  appendHistory(entry: string): void {
    fs.appendFileSync(this.historyFile, `${entry.trim()}\n\n`, "utf8");
  }

  getMemoryContext(): string {
    const longTerm = this.readLongTerm();
    return longTerm ? `## Long-term Memory\n${longTerm}` : "";
  }

  async consolidate(session: Session, provider: LLMProvider, model: string, opts?: { archiveAll?: boolean; memoryWindow?: number }): Promise<boolean> {
    const archiveAll = opts?.archiveAll ?? false;
    const memoryWindow = opts?.memoryWindow ?? 50;

    let oldMessages = [] as any[];
    let keepCount = 0;
    if (archiveAll) {
      oldMessages = session.messages;
      keepCount = 0;
    } else {
      keepCount = Math.floor(memoryWindow / 2);
      if (session.messages.length <= keepCount) return true;
      if (session.messages.length - session.lastConsolidated <= 0) return true;
      oldMessages = session.messages.slice(session.lastConsolidated, session.messages.length - keepCount);
      if (!oldMessages.length) return true;
    }

    const lines: string[] = [];
    for (const m of oldMessages) {
      if (!m.content) continue;
      const tools = Array.isArray(m.tools_used) && m.tools_used.length ? ` [tools: ${m.tools_used.join(", ")}]` : "";
      lines.push(`[${String(m.timestamp ?? "?").slice(0, 16)}] ${String(m.role).toUpperCase()}${tools}: ${String(m.content)}`);
    }

    const currentMemory = this.readLongTerm();
    const prompt = `Process this conversation and call the save_memory tool with your consolidation.\n\n## Current Long-term Memory\n${currentMemory || "(empty)"}\n\n## Conversation to Process\n${lines.join("\n")}`;

    try {
      const response = await provider.chat({
        model,
        messages: [
          { role: "system", content: "You are a memory consolidation agent. Call the save_memory tool." },
          { role: "user", content: prompt },
        ],
        tools: SAVE_MEMORY_TOOL,
      });

      if (!response.toolCalls.length) return false;
      const call = response.toolCalls[0];
      const args = call.arguments ?? {};
      const entry = args.history_entry;
      const update = args.memory_update;
      if (entry != null) this.appendHistory(typeof entry === "string" ? entry : JSON.stringify(entry));
      if (update != null) {
        const text = typeof update === "string" ? update : JSON.stringify(update);
        if (text !== currentMemory) this.writeLongTerm(text);
      }
      session.lastConsolidated = archiveAll ? 0 : session.messages.length - keepCount;
      return true;
    } catch {
      return false;
    }
  }
}
