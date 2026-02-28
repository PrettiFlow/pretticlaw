import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BUILTIN_SKILLS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../skills");

export class SkillsLoader {
  private readonly workspaceSkills: string;
  private readonly builtinSkills: string;

  constructor(workspace: string, builtinSkillsDir = BUILTIN_SKILLS_DIR) {
    this.workspaceSkills = path.join(workspace, "skills");
    this.builtinSkills = builtinSkillsDir;
  }

  listSkills(filterUnavailable = true): Array<{ name: string; path: string; source: string }> {
    const skills: Array<{ name: string; path: string; source: string }> = [];
    const load = (root: string, source: string) => {
      if (!fs.existsSync(root)) return;
      for (const name of fs.readdirSync(root)) {
        const skillFile = path.join(root, name, "SKILL.md");
        if (!fs.existsSync(skillFile)) continue;
        if (skills.some((s) => s.name === name)) continue;
        skills.push({ name, path: skillFile, source });
      }
    };
    load(this.workspaceSkills, "workspace");
    load(this.builtinSkills, "builtin");

    if (!filterUnavailable) return skills;
    return skills.filter((s) => this.checkRequirements(this.getSkillMeta(s.name)));
  }

  loadSkill(name: string): string | null {
    const workspace = path.join(this.workspaceSkills, name, "SKILL.md");
    if (fs.existsSync(workspace)) return fs.readFileSync(workspace, "utf8");
    const builtin = path.join(this.builtinSkills, name, "SKILL.md");
    if (fs.existsSync(builtin)) return fs.readFileSync(builtin, "utf8");
    return null;
  }

  loadSkillsForContext(skillNames: string[]): string {
    const parts: string[] = [];
    for (const name of skillNames) {
      const c = this.loadSkill(name);
      if (c) parts.push(`### Skill: ${name}\n\n${this.stripFrontmatter(c)}`);
    }
    return parts.join("\n\n---\n\n");
  }

  buildSkillsSummary(): string {
    const all = this.listSkills(false);
    if (!all.length) return "";
    const esc = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    const lines = ["<skills>"];
    for (const s of all) {
      const meta = this.getSkillMetadata(s.name) ?? {};
      const prettiMeta = this.getSkillMeta(s.name);
      const available = this.checkRequirements(prettiMeta);
      lines.push(`  <skill available="${available}">`);
      lines.push(`    <name>${esc(s.name)}</name>`);
      lines.push(`    <description>${esc((meta.description as string) || s.name)}</description>`);
      lines.push(`    <location>${s.path}</location>`);
      lines.push("  </skill>");
    }
    lines.push("</skills>");
    return lines.join("\n");
  }

  getAlwaysSkills(): string[] {
    const out: string[] = [];
    for (const s of this.listSkills(true)) {
      const meta = this.getSkillMetadata(s.name) ?? {};
      const m = this.getSkillMeta(s.name);
      if (m.always || meta.always) out.push(s.name);
    }
    return out;
  }

  getSkillMetadata(name: string): Record<string, unknown> | null {
    const content = this.loadSkill(name);
    if (!content?.startsWith("---")) return null;
    const m = content.match(/^---\n([\s\S]*?)\n---/);
    if (!m) return null;
    const out: Record<string, unknown> = {};
    for (const line of m[1].split(/\r?\n/)) {
      const idx = line.indexOf(":");
      if (idx <= 0) continue;
      out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
    }
    return out;
  }

  private stripFrontmatter(content: string): string {
    const m = content.match(/^---\n[\s\S]*?\n---\n?/);
    return m ? content.slice(m[0].length).trim() : content;
  }

  private getSkillMeta(name: string): Record<string, any> {
    const meta = this.getSkillMetadata(name) ?? {};
    const raw = typeof meta.metadata === "string" ? meta.metadata : "{}";
    try {
      const data = JSON.parse(raw);
      return data.pretticlaw || data.openclaw || {};
    } catch {
      return {};
    }
  }

  private checkRequirements(skillMeta: Record<string, any>): boolean {
    const req = skillMeta.requires ?? {};
    const bins: string[] = req.bins ?? [];
    const env: string[] = req.env ?? [];
    const hasBin = (name: string) => {
      const pathEntries = (process.env.PATH ?? "").split(path.delimiter);
      const exts = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
      return pathEntries.some((p) => exts.some((e) => fs.existsSync(path.join(p, `${name}${e}`))));
    };
    return bins.every(hasBin) && env.every((k) => !!process.env[k]);
  }
}
