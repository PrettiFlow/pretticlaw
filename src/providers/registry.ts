import { PROVIDERS, type Config, getApiBase, getProvider, getProviderName } from "../config/schema.js";
import type { LLMProvider } from "./base.js";
import { CustomProvider } from "./custom-provider.js";
import { LiteLLMProvider } from "./litellm-provider.js";

export function findByModel(model: string): (typeof PROVIDERS)[number] | null {
  const lower = model.toLowerCase();
  const norm = lower.replace(/-/g, "_");
  const prefix = lower.includes("/") ? lower.split("/", 1)[0].replace(/-/g, "_") : "";
  const standard = PROVIDERS.filter((p) => !p.isGateway && !p.isLocal);
  for (const spec of standard) {
    if (prefix && prefix === spec.name) return spec;
  }
  for (const spec of standard) {
    if (spec.keywords.some((k) => lower.includes(k) || norm.includes(k.replace(/-/g, "_")))) return spec;
  }
  return null;
}

export function stripModelPrefix(model: string): string {
  if (model.startsWith("openai-codex/")) return model.slice("openai-codex/".length);
  if (model.startsWith("openai_codex/")) return model.slice("openai_codex/".length);
  return model;
}

export function makeProvider(config: Config): LLMProvider {
  const model = config.agents.defaults.model;
  const providerName = getProviderName(config, model);
  const p = getProvider(config, model);

  const oauthProviders = new Set(["openai_codex", "github_copilot"]);
  const unsupportedInTs = new Set(["anthropic", "gemini"]);
  if (!providerName) {
    throw new Error("No provider could be resolved from config. Run `pretticlaw onboard` and set provider/model/API key.");
  }
  if (unsupportedInTs.has(providerName)) {
    throw new Error(`Provider '${providerName}' is not supported in this TypeScript port yet. Use openrouter/openai/deepseek/groq/custom.`);
  }
  if (!oauthProviders.has(providerName) && providerName !== "vllm" && providerName !== "custom" && !(p?.apiKey || "").trim()) {
    throw new Error(`No API key configured for provider '${providerName}'. Run 'pretticlaw onboard' or edit ~/.pretticlaw/config.json.`);
  }

  if (providerName === "custom") {
    return new CustomProvider(p?.apiKey || "no-key", getApiBase(config, model) || "http://localhost:8000/v1", model);
  }

  return new LiteLLMProvider(p?.apiKey ?? null, getApiBase(config, model), model, providerName);
}
