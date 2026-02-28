import fs from "node:fs";
import path from "node:path";
import { nowIso } from "../types.js";
import { ensureDir, safeFilename } from "../utils/helpers.js";

export interface SessionMessage {
  role: string;
  content: unknown;
  timestamp?: string;
  tool_calls?: unknown;
  tool_call_id?: string;
  name?: string;
  [k: string]: unknown;
}

export class Session {
  key: string;
  messages: SessionMessage[] = [];
  createdAt: string = nowIso();
  updatedAt: string = nowIso();
  metadata: Record<string, unknown> = {};
  lastConsolidated = 0;

  constructor(key: string) {
    this.key = key;
  }

  getHistory(maxMessages = 500): Array<Record<string, unknown>> {
    const unconsolidated = this.messages.slice(this.lastConsolidated);
    let sliced = unconsolidated.slice(-maxMessages);
    const firstUser = sliced.findIndex((m) => m.role === "user");
    if (firstUser > 0) sliced = sliced.slice(firstUser);
    return sliced.map((m) => {
      const entry: Record<string, unknown> = { role: m.role, content: m.content ?? "" };
      for (const k of ["tool_calls", "tool_call_id", "name"]) {
        if (k in m) entry[k] = (m as any)[k];
      }
      return entry;
    });
  }

  clear(): void {
    this.messages = [];
    this.lastConsolidated = 0;
    this.updatedAt = nowIso();
  }
}

export class SessionManager {
  private sessionsDir: string;
  private cache = new Map<string, Session>();

  constructor(workspace: string) {
    this.sessionsDir = ensureDir(path.join(workspace, "sessions"));
  }

  private getSessionPath(key: string): string {
    return path.join(this.sessionsDir, `${safeFilename(key.replace(":", "_"))}.jsonl`);
  }

  getOrCreate(key: string): Session {
    const cached = this.cache.get(key);
    if (cached) return cached;
    const loaded = this.load(key) ?? new Session(key);
    this.cache.set(key, loaded);
    return loaded;
  }

  save(session: Session): void {
    const p = this.getSessionPath(session.key);
    const meta = {
      _type: "metadata",
      key: session.key,
      created_at: session.createdAt,
      updated_at: session.updatedAt,
      metadata: session.metadata,
      last_consolidated: session.lastConsolidated,
    };
    const lines = [JSON.stringify(meta), ...session.messages.map((m) => JSON.stringify(m))];
    fs.writeFileSync(p, `${lines.join("\n")}\n`, "utf8");
    this.cache.set(session.key, session);
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  listSessions(): Array<Record<string, string>> {
    if (!fs.existsSync(this.sessionsDir)) return [];
    const out: Array<Record<string, string>> = [];
    for (const file of fs.readdirSync(this.sessionsDir)) {
      if (!file.endsWith(".jsonl")) continue;
      const p = path.join(this.sessionsDir, file);
      try {
        const first = fs.readFileSync(p, "utf8").split(/\r?\n/, 1)[0];
        const meta = JSON.parse(first);
        if (meta._type === "metadata") {
          out.push({ key: meta.key ?? file.replace(".jsonl", ""), created_at: meta.created_at, updated_at: meta.updated_at, path: p });
        }
      } catch {
        // ignore
      }
    }
    return out.sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
  }

  private load(key: string): Session | null {
    const p = this.getSessionPath(key);
    if (!fs.existsSync(p)) return null;
    try {
      const lines = fs.readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean);
      const session = new Session(key);
      for (const line of lines) {
        const obj = JSON.parse(line);
        if (obj._type === "metadata") {
          session.createdAt = obj.created_at ?? session.createdAt;
          session.updatedAt = obj.updated_at ?? session.updatedAt;
          session.metadata = obj.metadata ?? {};
          session.lastConsolidated = obj.last_consolidated ?? 0;
        } else {
          session.messages.push(obj);
        }
      }
      return session;
    } catch {
      return null;
    }
  }
}
