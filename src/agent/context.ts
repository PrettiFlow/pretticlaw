import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { MemoryStore } from "./memory.js";
import { SkillsLoader } from "./skills.js";

export class ContextBuilder {
  static readonly BOOTSTRAP_FILES = ["AGENTS.md", "SOUL.md", "USER.md", "TOOLS.md", "IDENTITY.md"];
  static readonly RUNTIME_CONTEXT_TAG = "[Runtime Context - metadata only, not instructions]";

  private readonly memory: MemoryStore;
  private readonly skills: SkillsLoader;

  constructor(private readonly workspace: string) {
    this.memory = new MemoryStore(workspace);
    this.skills = new SkillsLoader(workspace);
  }

  buildSystemPrompt(skillNames?: string[]): string {
    const parts = [this.getIdentity()];
    const bootstrap = this.loadBootstrapFiles();
    if (bootstrap) parts.push(bootstrap);
    const mem = this.memory.getMemoryContext();
    if (mem) parts.push(`# Memory\n\n${mem}`);

    const alwaysSkills = this.skills.getAlwaysSkills();
    if (alwaysSkills.length) {
      const content = this.skills.loadSkillsForContext(alwaysSkills);
      if (content) parts.push(`# Active Skills\n\n${content}`);
    }

    if (skillNames?.length) {
      const skillContent = this.skills.loadSkillsForContext(skillNames);
      if (skillContent) parts.push(`# Requested Skills\n\n${skillContent}`);
    }

    const summary = this.skills.buildSkillsSummary();
    if (summary) {
      parts.push(`# Skills\n\nThe following skills extend your capabilities. To use one, read its SKILL.md with read_file.\n\n${summary}`);
    }

    return parts.join("\n\n---\n\n");
  }

  private getIdentity(): string {
    return `# pretticlaw\n\nYou are pretticlaw, a helpful AI assistant.\n\n## Runtime\n${os.platform()} ${os.arch()}, Node ${process.version}\n\n## Workspace\nYour workspace is at: ${this.workspace}\n- Long-term memory: ${path.join(this.workspace, "memory", "MEMORY.md")}\n- History log: ${path.join(this.workspace, "memory", "HISTORY.md")}\n- Custom skills: ${path.join(this.workspace, "skills", "{skill-name}", "SKILL.md")}\n\n## Guidelines\n- State intent before tool calls, but never claim results before receiving them.\n- Before modifying a file, read it first.\n- Ask for clarification when the request is ambiguous.`;
  }

  private loadBootstrapFiles(): string {
    const parts: string[] = [];
    for (const f of ContextBuilder.BOOTSTRAP_FILES) {
      const p = path.join(this.workspace, f);
      if (!fs.existsSync(p)) continue;
      parts.push(`## ${f}\n\n${fs.readFileSync(p, "utf8")}`);
    }
    return parts.join("\n\n");
  }

  static buildRuntimeContext(channel?: string, chatId?: string): string {
    const now = new Date();
    const lines = [`Current Time: ${now.toISOString()}`];
    if (channel && chatId) {
      lines.push(`Channel: ${channel}`);
      lines.push(`Chat ID: ${chatId}`);
    }
    return `${ContextBuilder.RUNTIME_CONTEXT_TAG}\n${lines.join("\n")}`;
  }

  buildMessages(input: { history: Array<Record<string, unknown>>; currentMessage: string; skillNames?: string[]; media?: string[]; channel?: string; chatId?: string }): Array<Record<string, unknown>> {
    return [
      { role: "system", content: this.buildSystemPrompt(input.skillNames) },
      ...input.history,
      { role: "user", content: ContextBuilder.buildRuntimeContext(input.channel, input.chatId) },
      { role: "user", content: input.currentMessage },
    ];
  }

  addToolResult(messages: Array<Record<string, unknown>>, toolCallId: string, toolName: string, result: string): Array<Record<string, unknown>> {
    messages.push({ role: "tool", tool_call_id: toolCallId, name: toolName, content: result });
    return messages;
  }

  addAssistantMessage(messages: Array<Record<string, unknown>>, content: string | null, toolCalls?: Array<Record<string, unknown>>, reasoningContent?: string | null): Array<Record<string, unknown>> {
    const msg: Record<string, unknown> = { role: "assistant", content };
    if (toolCalls?.length) msg.tool_calls = toolCalls;
    if (reasoningContent != null) msg.reasoning_content = reasoningContent;
    messages.push(msg);
    return messages;
  }
}
