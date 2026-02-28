export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMResponse {
  content: string | null;
  toolCalls: ToolCallRequest[];
  finishReason: string;
  usage: Record<string, number>;
  reasoningContent: string | null;
}

export interface LLMProvider {
  chat(input: {
    messages: Array<Record<string, unknown>>;
    tools?: Array<Record<string, unknown>>;
    model?: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<LLMResponse>;
  getDefaultModel(): string;
}

export function sanitizeEmptyContent(messages: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return messages.map((msg) => {
    const content = msg.content;
    if (typeof content === "string" && content.length === 0) {
      if (msg.role === "assistant" && msg.tool_calls) return { ...msg, content: null };
      return { ...msg, content: "(empty)" };
    }
    if (Array.isArray(content)) {
      const filtered = content.filter((item) => !(typeof item === "object" && item && ["text", "input_text", "output_text"].includes((item as any).type) && !(item as any).text));
      if (filtered.length !== content.length) {
        if (filtered.length > 0) return { ...msg, content: filtered };
        if (msg.role === "assistant" && msg.tool_calls) return { ...msg, content: null };
        return { ...msg, content: "(empty)" };
      }
    }
    return msg;
  });
}
