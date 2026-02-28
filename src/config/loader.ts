import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DEFAULT_CONFIG, type Config } from "./schema.js";
import { getDataPath } from "../utils/helpers.js";

export function getConfigPath(): string {
  return path.join(os.homedir(), ".pretticlaw", "config.json");
}

export function getDataDir(): string {
  return getDataPath();
}

function deepMerge<T>(base: T, patch: unknown): T {
  if (!patch || typeof patch !== "object") return base;
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object" && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function migrateConfig(data: Record<string, unknown>): Record<string, unknown> {
  const tools = (data.tools as Record<string, unknown> | undefined) ?? {};
  const exec = (tools.exec as Record<string, unknown> | undefined) ?? {};
  if ("restrictToWorkspace" in exec && !("restrictToWorkspace" in tools)) {
    tools.restrictToWorkspace = exec.restrictToWorkspace;
    delete exec.restrictToWorkspace;
  }
  tools.exec = exec;
  data.tools = tools;
  return data;
}

export function loadConfig(configPath?: string): Config {
  const p = configPath ?? getConfigPath();
  if (!fs.existsSync(p)) return structuredClone(DEFAULT_CONFIG);

  try {
    const raw = fs.readFileSync(p, "utf8");
    const parsed = migrateConfig(JSON.parse(raw));
    return deepMerge(structuredClone(DEFAULT_CONFIG), parsed);
  } catch (err) {
    console.warn(`Warning: Failed to load config from ${p}: ${String(err)}`);
    return structuredClone(DEFAULT_CONFIG);
  }
}

export function saveConfig(config: Config, configPath?: string): void {
  const p = configPath ?? getConfigPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(config, null, 2), "utf8");
}
