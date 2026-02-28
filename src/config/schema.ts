import path from "node:path";

export interface ProviderConfig {
  apiKey: string;
  apiBase: string | null;
  extraHeaders: Record<string, string> | null;
}

export interface ChannelsConfig {
  sendProgress: boolean;
  sendToolHints: boolean;
  whatsapp: { enabled: boolean; bridgeUrl: string; bridgeToken: string; allowFrom: string[] };
  telegram: { enabled: boolean; token: string; allowFrom: string[]; proxy: string | null; replyToMessage: boolean };
  discord: { enabled: boolean; token: string; allowFrom: string[]; gatewayUrl: string; intents: number };
  feishu: { enabled: boolean; appId: string; appSecret: string; allowFrom: string[] };
  mochat: { enabled: boolean; baseUrl: string; allowFrom: string[] };
  dingtalk: { enabled: boolean; clientId: string; clientSecret: string; allowFrom: string[] };
  email: { enabled: boolean; consentGranted: boolean; imapHost: string; allowFrom: string[] };
  slack: { enabled: boolean; botToken: string; appToken: string; groupPolicy: string; groupAllowFrom: string[] };
  qq: { enabled: boolean; appId: string; secret: string; allowFrom: string[] };
  matrix: { enabled: boolean; homeserver: string; accessToken: string; userId: string; deviceId: string; allowFrom: string[] };
}

export interface Config {
  agents: {
    defaults: {
      workspace: string;
      model: string;
      provider: string;
      maxTokens: number;
      temperature: number;
      maxToolIterations: number;
      memoryWindow: number;
    };
  };
  channels: ChannelsConfig;
  providers: Record<string, ProviderConfig>;
  gateway: {
    host: string;
    port: number;
    heartbeat: { enabled: boolean; intervalS: number };
  };
  tools: {
    web: { search: { apiKey: string; maxResults: number } };
    exec: { timeout: number; pathAppend: string };
    restrictToWorkspace: boolean;
    mcpServers: Record<string, { command: string; args: string[]; env: Record<string, string>; url: string; headers: Record<string, string>; toolTimeout: number }>;
  };
}

export const PROVIDERS = [
  { name: "custom", keywords: [], isOauth: false, isGateway: false, isLocal: false, defaultApiBase: "" },
  { name: "openrouter", keywords: ["openrouter"], isOauth: false, isGateway: true, isLocal: false, defaultApiBase: "https://openrouter.ai/api/v1", detectByKeyPrefix: "sk-or-", detectByBaseKeyword: "openrouter" },
  { name: "aihubmix", keywords: ["aihubmix"], isOauth: false, isGateway: true, isLocal: false, defaultApiBase: "https://aihubmix.com/v1", detectByBaseKeyword: "aihubmix" },
  { name: "siliconflow", keywords: ["siliconflow"], isOauth: false, isGateway: true, isLocal: false, defaultApiBase: "https://api.siliconflow.cn/v1", detectByBaseKeyword: "siliconflow" },
  { name: "volcengine", keywords: ["volcengine", "volces", "ark"], isOauth: false, isGateway: true, isLocal: false, defaultApiBase: "https://ark.cn-beijing.volces.com/api/v3", detectByBaseKeyword: "volces" },
  { name: "anthropic", keywords: ["anthropic", "claude"], isOauth: false, isGateway: false, isLocal: false, defaultApiBase: "" },
  { name: "openai", keywords: ["openai", "gpt"], isOauth: false, isGateway: false, isLocal: false, defaultApiBase: "" },
  { name: "openai_codex", keywords: ["openai-codex", "codex"], isOauth: true, isGateway: false, isLocal: false, defaultApiBase: "https://chatgpt.com/backend-api" },
  { name: "github_copilot", keywords: ["github_copilot", "copilot"], isOauth: true, isGateway: false, isLocal: false, defaultApiBase: "" },
  { name: "deepseek", keywords: ["deepseek"], isOauth: false, isGateway: false, isLocal: false, defaultApiBase: "" },
  { name: "gemini", keywords: ["gemini"], isOauth: false, isGateway: false, isLocal: false, defaultApiBase: "" },
  { name: "zhipu", keywords: ["zhipu", "glm", "zai"], isOauth: false, isGateway: false, isLocal: false, defaultApiBase: "" },
  { name: "dashscope", keywords: ["qwen", "dashscope"], isOauth: false, isGateway: false, isLocal: false, defaultApiBase: "" },
  { name: "moonshot", keywords: ["moonshot", "kimi"], isOauth: false, isGateway: false, isLocal: false, defaultApiBase: "https://api.moonshot.ai/v1" },
  { name: "minimax", keywords: ["minimax"], isOauth: false, isGateway: false, isLocal: false, defaultApiBase: "https://api.minimax.io/v1" },
  { name: "vllm", keywords: ["vllm"], isOauth: false, isGateway: false, isLocal: true, defaultApiBase: "" },
  { name: "groq", keywords: ["groq"], isOauth: false, isGateway: false, isLocal: false, defaultApiBase: "" },
] as const;

const providerDefaults = Object.fromEntries(PROVIDERS.map((p) => [p.name, { apiKey: "", apiBase: null, extraHeaders: null }])) as Record<string, ProviderConfig>;

export const DEFAULT_CONFIG: Config = {
  agents: {
    defaults: {
      workspace: path.join("~", ".pretticlaw", "workspace"),
      model: "anthropic/claude-sonnet-4",
      provider: "auto",
      maxTokens: 8192,
      temperature: 0.1,
      maxToolIterations: 40,
      memoryWindow: 100,
    },
  },
  channels: {
    sendProgress: true,
    sendToolHints: false,
    whatsapp: { enabled: false, bridgeUrl: "ws://localhost:3001", bridgeToken: "", allowFrom: [] },
    telegram: { enabled: false, token: "", allowFrom: [], proxy: null, replyToMessage: false },
    discord: { enabled: false, token: "", allowFrom: [], gatewayUrl: "wss://gateway.discord.gg/?v=10&encoding=json", intents: 37377 },
    feishu: { enabled: false, appId: "", appSecret: "", allowFrom: [] },
    mochat: { enabled: false, baseUrl: "https://mochat.io", allowFrom: [] },
    dingtalk: { enabled: false, clientId: "", clientSecret: "", allowFrom: [] },
    email: { enabled: false, consentGranted: false, imapHost: "", allowFrom: [] },
    slack: { enabled: false, botToken: "", appToken: "", groupPolicy: "mention", groupAllowFrom: [] },
    qq: { enabled: false, appId: "", secret: "", allowFrom: [] },
    matrix: { enabled: false, homeserver: "https://matrix.org", accessToken: "", userId: "", deviceId: "", allowFrom: [] },
  },
  providers: providerDefaults,
  gateway: { host: "0.0.0.0", port: 18790, heartbeat: { enabled: true, intervalS: 1800 } },
  tools: { web: { search: { apiKey: "", maxResults: 5 } }, exec: { timeout: 60, pathAppend: "" }, restrictToWorkspace: false, mcpServers: {} },
};

function normalize(name: string): string {
  return name.toLowerCase().replace(/-/g, "_");
}

export function getProviderName(config: Config, model?: string): string | null {
  const forced = config.agents.defaults.provider;
  if (forced !== "auto") return config.providers[forced] ? forced : null;

  const m = (model ?? config.agents.defaults.model).toLowerCase();
  const mNorm = normalize(m);
  const prefix = m.includes("/") ? m.split("/", 1)[0] : "";

  for (const spec of PROVIDERS) {
    const p = config.providers[spec.name];
    if (prefix && normalize(prefix) === spec.name && (spec.isOauth || p?.apiKey)) return spec.name;
  }
  for (const spec of PROVIDERS) {
    const p = config.providers[spec.name];
    if (spec.keywords.some((kw) => m.includes(kw) || mNorm.includes(normalize(kw))) && (spec.isOauth || p?.apiKey)) return spec.name;
  }
  for (const spec of PROVIDERS) {
    if (spec.isOauth) continue;
    const p = config.providers[spec.name];
    if (p?.apiKey) return spec.name;
  }
  return null;
}

export function getProvider(config: Config, model?: string): ProviderConfig | null {
  const name = getProviderName(config, model);
  return name ? config.providers[name] ?? null : null;
}

export function getApiBase(config: Config, model?: string): string | null {
  const name = getProviderName(config, model);
  if (!name) return null;
  const p = config.providers[name];
  if (p?.apiBase) return p.apiBase;
  const spec = PROVIDERS.find((s) => s.name === name);
  return spec?.isGateway ? spec.defaultApiBase : null;
}
