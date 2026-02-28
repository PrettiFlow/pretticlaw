import fs from "node:fs";
import path from "node:path";
import { Tool } from "./base.js";

function resolvePath(input: string, workspace?: string, allowedDir?: string): string {
  const expanded = input.startsWith("~") ? path.join(process.env.USERPROFILE || process.env.HOME || "", input.slice(1)) : input;
  const base = path.isAbsolute(expanded) ? expanded : workspace ? path.join(workspace, expanded) : expanded;
  const resolved = path.resolve(base);
  if (allowedDir) {
    const allow = path.resolve(allowedDir);
    if (!resolved.startsWith(allow)) throw new Error(`Path ${input} is outside allowed directory ${allowedDir}`);
  }
  return resolved;
}

export class ReadFileTool extends Tool {
  readonly name = "read_file";
  readonly description = "Read the contents of a file at the given path.";
  readonly parameters = { type: "object", properties: { path: { type: "string", description: "The file path to read" } }, required: ["path"] };
  constructor(private readonly workspace?: string, private readonly allowedDir?: string) { super(); }
  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      const p = resolvePath(String(args.path), this.workspace, this.allowedDir);
      if (!fs.existsSync(p)) return `Error: File not found: ${String(args.path)}`;
      if (!fs.statSync(p).isFile()) return `Error: Not a file: ${String(args.path)}`;
      return fs.readFileSync(p, "utf8");
    } catch (err) {
      return `Error reading file: ${String(err)}`;
    }
  }
}

export class WriteFileTool extends Tool {
  readonly name = "write_file";
  readonly description = "Write content to a file at the given path. Creates parent directories if needed.";
  readonly parameters = { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] };
  constructor(private readonly workspace?: string, private readonly allowedDir?: string) { super(); }
  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      const p = resolvePath(String(args.path), this.workspace, this.allowedDir);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      const content = String(args.content ?? "");
      fs.writeFileSync(p, content, "utf8");
      return `Successfully wrote ${content.length} bytes to ${p}`;
    } catch (err) {
      return `Error writing file: ${String(err)}`;
    }
  }
}

export class EditFileTool extends Tool {
  readonly name = "edit_file";
  readonly description = "Edit a file by replacing old_text with new_text. The old_text must exist exactly in the file.";
  readonly parameters = { type: "object", properties: { path: { type: "string" }, old_text: { type: "string" }, new_text: { type: "string" } }, required: ["path", "old_text", "new_text"] };
  constructor(private readonly workspace?: string, private readonly allowedDir?: string) { super(); }
  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      const p = resolvePath(String(args.path), this.workspace, this.allowedDir);
      if (!fs.existsSync(p)) return `Error: File not found: ${String(args.path)}`;
      const content = fs.readFileSync(p, "utf8");
      const oldText = String(args.old_text ?? "");
      const newText = String(args.new_text ?? "");
      if (!content.includes(oldText)) return `Error: old_text not found in ${String(args.path)}. Verify the file content.`;
      if (content.split(oldText).length - 1 > 1) return `Warning: old_text appears ${content.split(oldText).length - 1} times. Please provide more context to make it unique.`;
      fs.writeFileSync(p, content.replace(oldText, newText), "utf8");
      return `Successfully edited ${p}`;
    } catch (err) {
      return `Error editing file: ${String(err)}`;
    }
  }
}

export class ListDirTool extends Tool {
  readonly name = "list_dir";
  readonly description = "List the contents of a directory.";
  readonly parameters = { type: "object", properties: { path: { type: "string" } }, required: ["path"] };
  constructor(private readonly workspace?: string, private readonly allowedDir?: string) { super(); }
  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      const p = resolvePath(String(args.path), this.workspace, this.allowedDir);
      if (!fs.existsSync(p)) return `Error: Directory not found: ${String(args.path)}`;
      if (!fs.statSync(p).isDirectory()) return `Error: Not a directory: ${String(args.path)}`;
      const items = fs.readdirSync(p).sort().map((n) => {
        const full = path.join(p, n);
        return `${fs.statSync(full).isDirectory() ? "[DIR]" : "[FILE]"} ${n}`;
      });
      if (!items.length) return `Directory ${String(args.path)} is empty`;
      return items.join("\n");
    } catch (err) {
      return `Error listing directory: ${String(err)}`;
    }
  }
}
