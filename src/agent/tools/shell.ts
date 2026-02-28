import { exec } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { Tool } from "./base.js";

const execAsync = promisify(exec);

export class ExecTool extends Tool {
  readonly name = "exec";
  readonly description = "Execute a shell command and return its output. Use with caution.";
  readonly parameters = {
    type: "object",
    properties: {
      command: { type: "string", description: "The shell command to execute" },
      working_dir: { type: "string", description: "Optional working directory for the command" },
    },
    required: ["command"],
  };

  constructor(
    private readonly timeout = 60,
    private readonly workingDir?: string,
    private readonly restrictToWorkspace = false,
    private readonly pathAppend = "",
  ) { super(); }

  private guard(command: string, cwd: string): string | null {
    const lower = command.toLowerCase();
    const deny = [/\brm\s+-[rf]{1,2}\b/, /\bdel\s+\/[fq]\b/, /\brmdir\s+\/s\b/, /(?:^|[;&|]\s*)format\b/, /\b(mkfs|diskpart)\b/, /\bdd\s+if=/, />\s*\/dev\/sd/, /\b(shutdown|reboot|poweroff)\b/, /:\(\)\s*\{.*\};\s*:/];
    if (deny.some((r) => r.test(lower))) return "Error: Command blocked by safety guard (dangerous pattern detected)";
    if (this.restrictToWorkspace) {
      if (command.includes("../") || command.includes("..\\")) return "Error: Command blocked by safety guard (path traversal detected)";
      const abs = command.match(/[A-Za-z]:\\[^\s"']+/g) ?? [];
      for (const raw of abs) {
        const p = path.resolve(raw);
        const c = path.resolve(cwd);
        if (!p.startsWith(c)) return "Error: Command blocked by safety guard (path outside working dir)";
      }
    }
    return null;
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const command = String(args.command ?? "");
    const cwd = String(args.working_dir ?? this.workingDir ?? process.cwd());
    const blocked = this.guard(command, cwd);
    if (blocked) return blocked;

    const env = { ...process.env } as Record<string, string>;
    if (this.pathAppend) env.PATH = `${env.PATH ?? ""}${path.delimiter}${this.pathAppend}`;

    try {
      const { stdout, stderr } = await execAsync(command, { cwd, env, timeout: this.timeout * 1000, maxBuffer: 1024 * 1024 });
      let out = "";
      if (stdout) out += stdout;
      if (stderr?.trim()) out += `${out ? "\n" : ""}STDERR:\n${stderr}`;
      if (!out) out = "(no output)";
      if (out.length > 10000) out = `${out.slice(0, 10000)}\n... (truncated, ${out.length - 10000} more chars)`;
      return out;
    } catch (err: any) {
      if (typeof err?.killed === "boolean" && err.killed) return `Error: Command timed out after ${this.timeout} seconds`;
      const stdout = err?.stdout ? `${err.stdout}\n` : "";
      const stderr = err?.stderr ? `STDERR:\n${err.stderr}\n` : "";
      const code = typeof err?.code === "number" ? `\nExit code: ${err.code}` : "";
      const text = `${stdout}${stderr}${code}`.trim();
      return text || `Error executing command: ${String(err)}`;
    }
  }
}
