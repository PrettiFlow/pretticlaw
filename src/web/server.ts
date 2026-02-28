import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AgentLoop } from "../agent/loop.js";
import type { CronService } from "../cron/service.js";
import type { Config } from "../config/schema.js";
import { loadConfig, saveConfig } from "../config/loader.js";
import type { SessionManager } from "../session/manager.js";

type JsonObj = Record<string, unknown>;

function dashboardDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "../dashboard"),
    path.resolve(here, "../../src/dashboard"),
    path.resolve(process.cwd(), "dist/dashboard"),
    path.resolve(process.cwd(), "src/dashboard"),
  ];
  const found = candidates.find((p) => fs.existsSync(path.join(p, "index.html")));
  return found ?? candidates[candidates.length - 1];
}

function readBody(req: IncomingMessage): Promise<JsonObj> {
  return new Promise((resolve) => {
    let buf = "";
    req.on("data", (c) => {
      buf += c.toString();
      if (buf.length > 2_000_000) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(buf ? (JSON.parse(buf) as JsonObj) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function contentType(file: string): string {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".json")) return "application/json; charset=utf-8";
  if (file.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

export function startDashboardServer(input: {
  agent: AgentLoop;
  cron: CronService;
  config: Config;
  sessionManager: SessionManager;
  sessionKey: string;
  port?: number;
}): { close: () => Promise<void>; port: number } {
  const staticDir = dashboardDir();

  const server = createServer(async (req, res) => {
    const method = req.method || "GET";
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;

    const methodColors: Record<string, string> = {
      GET: "\x1b[32m",
      POST: "\x1b[34m",
      PUT: "\x1b[33m",
      DELETE: "\x1b[31m",
    };
    const color = methodColors[method] ?? "\x1b[0m";
    console.log(`[gateway] ${color}${method}\x1b[0m ${pathname}`);

    if (method === "GET" && pathname === "/api/status") {
      const cfg = loadConfig();
      return sendJson(res, 200, {
        provider: cfg.agents.defaults.provider,
        model: cfg.agents.defaults.model,
        cron: input.cron.status(),
        channels: cfg.channels,
        gateway: cfg.gateway,
      });
    }

    if (method === "GET" && pathname === "/api/history") {
      const session = input.sessionManager.getOrCreate(input.sessionKey);
      // Attach tool_calls (full objects) if present
      type MsgWithTools = typeof session.messages[number] & { tool_calls?: any[] };
      const messages: MsgWithTools[] = (session.messages || []).map(msg => {
        if (msg && Array.isArray((msg as any).tool_calls)) {
          return { ...msg, tool_calls: (msg as any).tool_calls };
        }
        return msg as MsgWithTools;
      });
      return sendJson(res, 200, { messages });
    }

    if (method === "POST" && pathname === "/api/chat") {
      const body = await readBody(req);
      const message = String(body.message ?? "").trim();
      const session = String(body.session ?? "web:dashboard");
      if (!message) return sendJson(res, 400, { error: "message required" });
      const progress: Array<{ content: string; toolHint: boolean; tool_calls?: any[] }> = [];
      try {
        const response = await input.agent.processDirect(
          message,
          session,
          "cli",
          "dashboard",
          async (content, meta) => {
            // meta.tool_calls may exist (array of tool call objects)
            progress.push({ content, toolHint: !!meta?.toolHint, tool_calls: meta?.tool_calls });
          },
        );
        return sendJson(res, 200, { response, progress });
      } catch (err) {
        return sendJson(res, 500, { error: String(err) });
      }
    }

    if (method === "GET" && pathname === "/api/config") {
      return sendJson(res, 200, loadConfig());
    }

    if (method === "PUT" && pathname === "/api/config") {
      const raw = await readBody(req);
      const cfg = raw as unknown as Config;
      saveConfig(cfg);
      return sendJson(res, 200, { ok: true });
    }

    if (method === "GET" && pathname === "/api/cron/jobs") {
      const includeDisabled = url.searchParams.get("all") === "1";
      return sendJson(res, 200, input.cron.listJobs(includeDisabled));
    }

    if (method === "POST" && pathname === "/api/cron/jobs") {
      const body = await readBody(req);
      try {
        const job = input.cron.addJob({
          name: String(body.name ?? "job"),
          schedule: body.schedule as any,
          message: String(body.message ?? ""),
          deliver: !!body.deliver,
          channel: body.channel ? String(body.channel) : undefined,
          to: body.to ? String(body.to) : undefined,
          deleteAfterRun: !!body.deleteAfterRun,
        });
        return sendJson(res, 200, job);
      } catch (err) {
        return sendJson(res, 400, { error: String(err) });
      }
    }

    const cronIdMatch = pathname.match(/^\/api\/cron\/jobs\/([^/]+)$/);
    if (cronIdMatch && method === "DELETE") {
      return sendJson(res, 200, { ok: input.cron.removeJob(cronIdMatch[1]) });
    }

    const cronEnableMatch = pathname.match(/^\/api\/cron\/jobs\/([^/]+)\/enable$/);
    if (cronEnableMatch && method === "POST") {
      const body = await readBody(req);
      const enabled = body.enabled !== false;
      const job = input.cron.enableJob(cronEnableMatch[1], enabled);
      if (!job) return sendJson(res, 404, { error: "not found" });
      return sendJson(res, 200, job);
    }

    const cronRunMatch = pathname.match(/^\/api\/cron\/jobs\/([^/]+)\/run$/);
    if (cronRunMatch && method === "POST") {
      const body = await readBody(req);
      const ok = await input.cron.runJob(cronRunMatch[1], !!body.force);
      return sendJson(res, 200, { ok });
    }

    let filePath = path.join(staticDir, pathname === "/" ? "index.html" : pathname.slice(1));
    if (!filePath.startsWith(staticDir)) filePath = path.join(staticDir, "index.html");
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(staticDir, "index.html");
    }
    if (!fs.existsSync(filePath)) {
      res.statusCode = 404;
      res.end("Dashboard assets not found. Run npm run build.");
      return;
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", contentType(filePath));
    fs.createReadStream(filePath).pipe(res);
  });

  const port = input.port ?? 6767;
  server.listen(port);

  return {
    port,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}
