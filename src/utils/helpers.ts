import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const UNSAFE = /[<>:"/\\|?*]/g;

export function ensureDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getDataPath(): string {
  return ensureDir(path.join(os.homedir(), ".pretticlaw"));
}

export function getWorkspacePath(workspace?: string): string {
  const p = workspace ? workspace.replace(/^~(?=$|[\\/])/, os.homedir()) : path.join(os.homedir(), ".pretticlaw", "workspace");
  return ensureDir(path.resolve(p));
}

export function safeFilename(name: string): string {
  return name.replace(UNSAFE, "_").trim();
}

export function syncWorkspaceTemplates(workspace: string, silent = false): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "../templates"),
    path.resolve(here, "../../src/templates"),
    path.resolve(process.cwd(), "dist/templates"),
    path.resolve(process.cwd(), "src/templates"),
  ];
  const templates = candidates.find((p) => fs.existsSync(path.join(p, "AGENTS.md")));
  if (!templates) return [];
  const created: string[] = [];
  const writeIfMissing = (src: string | null, dest: string) => {
    if (fs.existsSync(dest)) return;
    ensureDir(path.dirname(dest));
    if (src) fs.copyFileSync(src, dest);
    else fs.writeFileSync(dest, "", "utf8");
    created.push(path.relative(workspace, dest));
  };

  const md = ["AGENTS.md", "SOUL.md", "USER.md", "TOOLS.md", "HEARTBEAT.md"];
  for (const f of md) writeIfMissing(path.join(templates, f), path.join(workspace, f));
  writeIfMissing(path.join(templates, "memory", "MEMORY.md"), path.join(workspace, "memory", "MEMORY.md"));
  writeIfMissing(null, path.join(workspace, "memory", "HISTORY.md"));
  ensureDir(path.join(workspace, "skills"));

  if (!silent) {
    for (const item of created) console.log(`  Created ${item}`);
  }
  return created;
}
