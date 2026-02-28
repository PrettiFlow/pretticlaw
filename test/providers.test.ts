import { describe, expect, test } from "vitest";
import { DEFAULT_CONFIG, getProviderName } from "../src/config/schema.js";
import { findByModel } from "../src/providers/registry.js";
import { LiteLLMProvider } from "../src/providers/litellm-provider.js";
import { stripModelPrefix } from "../src/providers/registry.js";

describe("provider matching", () => {
  test("matches github copilot with hyphen prefix", () => {
    const config = structuredClone(DEFAULT_CONFIG);
    config.agents.defaults.model = "github-copilot/gpt-5.3-codex";
    config.providers.github_copilot.apiKey = "oauth";
    expect(getProviderName(config)).toBe("github_copilot");
  });

  test("matches openai codex with hyphen prefix", () => {
    const config = structuredClone(DEFAULT_CONFIG);
    config.agents.defaults.model = "openai-codex/gpt-5.1-codex";
    config.providers.openai_codex.apiKey = "oauth";
    expect(getProviderName(config)).toBe("openai_codex");
  });

  test("find by model prefers explicit prefix", () => {
    const spec = findByModel("github-copilot/gpt-5.3-codex");
    expect(spec?.name).toBe("github_copilot");
  });

  test("canonicalizes github copilot hyphen prefix", () => {
    const provider = new LiteLLMProvider(null, null, "github-copilot/gpt-5.3-codex", null);
    expect(provider.resolveModel("github-copilot/gpt-5.3-codex")).toBe("github_copilot/gpt-5.3-codex");
  });

  test("strips groq/ prefix for groq models", () => {
    const provider = new LiteLLMProvider("key", "https://api.groq.com/openai/v1", "llama-3.3-70b-versatile", "groq");
    expect(provider.resolveModel("groq/llama-3.3-70b-versatile")).toBe("llama-3.3-70b-versatile");
    expect(provider.resolveModel("openai/gpt-oss-120b")).toBe("openai/gpt-oss-120b");
    expect(provider.resolveModel("groq/compound")).toBe("groq/compound");
  });

  test("openai codex strip prefix supports hyphen and underscore", () => {
    expect(stripModelPrefix("openai-codex/gpt-5.1-codex")).toBe("gpt-5.1-codex");
    expect(stripModelPrefix("openai_codex/gpt-5.1-codex")).toBe("gpt-5.1-codex");
  });
});
