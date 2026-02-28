import OpenAI from "openai";
import type { LLMProvider, LLMResponse, ToolCallRequest } from "./base.js";
import { sanitizeEmptyContent } from "./base.js";

export class CustomProvider implements LLMProvider {
  private client: OpenAI;
  constructor(private readonly apiKey: string, private readonly apiBase: string, private readonly defaultModel: string) {
    this.client = new OpenAI({ apiKey, baseURL: apiBase });
  }

  getDefaultModel(): string {
    return this.defaultModel;
  }

  async chat(input: { messages: Array<Record<string, unknown>>; tools?: Array<Record<string, unknown>>; model?: string; maxTokens?: number; temperature?: number; }): Promise<LLMResponse> {
    try {
      const res = await this.client.chat.completions.create({
        model: input.model ?? this.defaultModel,
        messages: sanitizeEmptyContent(input.messages) as any,
        tools: input.tools as any,
        tool_choice: input.tools ? "auto" : undefined,
        max_tokens: Math.max(1, input.maxTokens ?? 4096),
        temperature: input.temperature ?? 0.7,
      });
      const choice = res.choices[0];
      const toolCalls: ToolCallRequest[] = (choice.message.tool_calls ?? []).map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments || "{}"),
      }));
      return {
        content: choice.message.content,
        toolCalls,
        finishReason: choice.finish_reason ?? "stop",
        usage: {
          prompt_tokens: res.usage?.prompt_tokens ?? 0,
          completion_tokens: res.usage?.completion_tokens ?? 0,
          total_tokens: res.usage?.total_tokens ?? 0,
        },
        reasoningContent: null,
      };
    } catch (err) {
      return { content: `Error: ${String(err)}`, toolCalls: [], finishReason: "error", usage: {}, reasoningContent: null };
    }
  }
}
