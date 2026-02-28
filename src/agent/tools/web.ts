import { Tool } from "./base.js";

function stripTags(text: string): string {
  return text.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, "").trim();
}

function normalize(text: string): string {
  return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function validateUrl(url: string): [boolean, string] {
  try {
    const u = new URL(url);
    if (!["http:", "https:"].includes(u.protocol)) return [false, `Only http/https allowed, got '${u.protocol.replace(":", "")}'`];
    if (!u.hostname) return [false, "Missing domain"];
    return [true, ""];
  } catch (err) {
    return [false, String(err)];
  }
}

export class WebSearchTool extends Tool {
  readonly name = "web_search";
  readonly description = "Search the web. Returns titles, URLs, and snippets.";
  readonly parameters = {
    type: "object",
    properties: { query: { type: "string", description: "Search query" }, count: { type: "integer", minimum: 1, maximum: 10, description: "Results (1-10)" } },
    required: ["query"],
  };

  constructor(private readonly apiKey: string | null, private readonly maxResults = 5) { super(); }

  async execute(args: Record<string, unknown>): Promise<string> {
    const query = String(args.query ?? "");
    const count = Math.min(Math.max(Number(args.count ?? this.maxResults), 1), 10);
    const key = this.apiKey || process.env.BRAVE_API_KEY || "";
    if (!key) return "Error: Brave Search API key not configured. Set tools.web.search.apiKey or BRAVE_API_KEY.";

    try {
      const url = new URL("https://api.search.brave.com/res/v1/web/search");
      url.searchParams.set("q", query);
      url.searchParams.set("count", String(count));
      const res = await fetch(url, { headers: { Accept: "application/json", "X-Subscription-Token": key } });
      if (!res.ok) return `Error: ${res.status} ${res.statusText}`;
      const json: any = await res.json();
      const results = json.web?.results ?? [];
      if (!results.length) return `No results for: ${query}`;
      const lines = [`Results for: ${query}`, ""];
      results.slice(0, count).forEach((item: any, i: number) => {
        lines.push(`${i + 1}. ${item.title ?? ""}`);
        lines.push(`   ${item.url ?? ""}`);
        if (item.description) lines.push(`   ${item.description}`);
      });
      return lines.join("\n");
    } catch (err) {
      return `Error: ${String(err)}`;
    }
  }
}

export class WebFetchTool extends Tool {
  readonly name = "web_fetch";
  readonly description = "Fetch URL and extract readable content (HTML to markdown/text).";
  readonly parameters = {
    type: "object",
    properties: {
      url: { type: "string", description: "URL to fetch" },
      extractMode: { type: "string", enum: ["markdown", "text"] },
      maxChars: { type: "integer", minimum: 100 },
    },
    required: ["url"],
  };

  constructor(private readonly maxChars = 50000) { super(); }

  async execute(args: Record<string, unknown>): Promise<string> {
    const url = String(args.url ?? "");
    const extractMode = String(args.extractMode ?? "markdown");
    const maxChars = Number(args.maxChars ?? this.maxChars);
    const [ok, err] = validateUrl(url);
    if (!ok) return JSON.stringify({ error: `URL validation failed: ${err}`, url });

    try {
      const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0" } });
      const ctype = res.headers.get("content-type") || "";
      let text = "";
      let extractor = "raw";
      if (ctype.includes("application/json")) {
        text = JSON.stringify(await res.json(), null, 2);
        extractor = "json";
      } else {
        const raw = await res.text();
        if (ctype.includes("text/html") || /^\s*<!doctype|^\s*<html/i.test(raw.slice(0, 256))) {
          const content = extractMode === "text" ? stripTags(raw) : normalize(stripTags(raw));
          text = content;
          extractor = "html";
        } else {
          text = raw;
        }
      }
      const truncated = text.length > maxChars;
      const sliced = truncated ? text.slice(0, maxChars) : text;
      return JSON.stringify({ url, finalUrl: res.url, status: res.status, extractor, truncated, length: sliced.length, text: sliced });
    } catch (e) {
      return JSON.stringify({ error: String(e), url });
    }
  }
}
