import { nanoid } from "nanoid";
import type { LLMProvider, LLMResponse, ToolCallRequest } from "./base.js";
import { sanitizeEmptyContent } from "./base.js";

export class LiteLLMProvider implements LLMProvider {
  private static readonly DEFAULT_BASE_BY_PROVIDER: Record<string, string> = {
    openrouter: "https://openrouter.ai/api/v1",
    openai: "https://api.openai.com/v1",
    deepseek: "https://api.deepseek.com/v1",
    groq: "https://api.groq.com/openai/v1",
    moonshot: "https://api.moonshot.ai/v1",
    minimax: "https://api.minimax.io/v1",
    dashscope: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    zhipu: "https://open.bigmodel.cn/api/paas/v4",
    siliconflow: "https://api.siliconflow.cn/v1",
    volcengine: "https://ark.cn-beijing.volces.com/api/v3",
    vllm: "http://localhost:8000/v1",
    custom: "http://localhost:8000/v1",
  };

  private static readonly UNSUPPORTED_PROVIDERS = new Set(["anthropic", "gemini", "openai_codex", "github_copilot"]);

  constructor(
    private readonly apiKey: string | null,
    private readonly apiBase: string | null,
    private readonly defaultModel: string,
    private readonly providerName: string | null,
  ) {}

  getDefaultModel(): string {
    return this.defaultModel;
  }

  resolveModel(model: string): string {
    const canonicalize = (s: string) => s.toLowerCase().replace(/-/g, "_");
    if (model.includes("/")) {
      const [prefix, rest] = model.split("/", 2);
      if (canonicalize(prefix) === "github_copilot") return `github_copilot/${rest}`;
      if (canonicalize(prefix) === "openai_codex") return `openai_codex/${rest}`;
      // Groq OpenAI-compatible endpoint expects model ids like:
      //   llama-3.3-70b-versatile
      //   openai/gpt-oss-120b
      // so a "groq/" prefix should be stripped.
      if (canonicalize(prefix) === "groq") {
        if (rest === "compound" || rest === "compound-mini") return `groq/${rest}`;
        return rest;
      }
    }
    return model;
  }

  async chat(input: { messages: Array<Record<string, unknown>>; tools?: Array<Record<string, unknown>>; model?: string; maxTokens?: number; temperature?: number; }): Promise<LLMResponse> {
    const model = this.resolveModel(input.model ?? this.defaultModel);
    const body: Record<string, unknown> = {
      model,
      messages: sanitizeEmptyContent(input.messages),
      max_tokens: Math.max(1, input.maxTokens ?? 4096),
      temperature: input.temperature ?? 0.7,
    };
    if (input.tools?.length) {
      body.tools = input.tools;
      body.tool_choice = "auto";
    }

    try {
      const providerGuess = (this.providerName ?? "").trim();
      if (providerGuess && LiteLLMProvider.UNSUPPORTED_PROVIDERS.has(providerGuess)) {
        return {
          content: `Error calling LLM: provider '${providerGuess}' is not supported in this TypeScript port yet. Use openrouter/openai/deepseek/groq/custom.`,
          toolCalls: [],
          finishReason: "error",
          usage: {},
          reasoningContent: null,
        };
      }

      const apiBase =
        this.apiBase ??
        (providerGuess ? LiteLLMProvider.DEFAULT_BASE_BY_PROVIDER[providerGuess] : undefined) ??
        (this.apiKey?.startsWith("sk-or-") ? LiteLLMProvider.DEFAULT_BASE_BY_PROVIDER.openrouter : undefined);

      if (!apiBase) {
        return {
          content: "Error calling LLM: api_base not configured. Set provider/api_base in ~/.pretticlaw/config.json or run pretticlaw onboard.",
          toolCalls: [],
          finishReason: "error",
          usage: {},
          reasoningContent: null,
        };
      }
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

      const res = await fetch(`${apiBase.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const json: any = await res.json();
      if (!res.ok) {
        const code = json?.error?.code ?? "";
        const message = json?.error?.message ?? JSON.stringify(json);
        if (code === "model_not_found") {
          const hint = providerGuess === "groq"
            ? "Try a Groq-supported model like llama-3.3-70b-versatile or openai/gpt-oss-120b. You can run `pretticlaw doctor`."
            : "Check your model id and provider access. You can run `pretticlaw doctor`.";
          return { content: `Error calling LLM: ${message}\n${hint}`, toolCalls: [], finishReason: "error", usage: {}, reasoningContent: null };
        }
        return { content: `Error calling LLM: ${message}`, toolCalls: [], finishReason: "error", usage: {}, reasoningContent: null };
      }
      const choice = json.choices?.[0]?.message ? json.choices[0] : null;
      if (!choice) {
        return { content: `Error calling LLM: ${JSON.stringify(json)}`, toolCalls: [], finishReason: "error", usage: {}, reasoningContent: null };
      }
      const toolCalls: ToolCallRequest[] = (choice.message.tool_calls ?? []).map((tc: any) => ({
        id: nanoid(9),
        name: tc.function.name,
        arguments: typeof tc.function.arguments === "string" ? JSON.parse(tc.function.arguments || "{}") : tc.function.arguments,
      }));
      return {
        content: choice.message.content ?? null,
        toolCalls,
        finishReason: choice.finish_reason ?? "stop",
        usage: json.usage ?? {},
        reasoningContent: choice.message.reasoning_content ?? null,
      };
    } catch (err) {
      return { content: `Error calling LLM: ${String(err)}`, toolCalls: [], finishReason: "error", usage: {}, reasoningContent: null };
    }
  }
}
