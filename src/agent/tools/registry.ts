import { Tool } from "./base.js";

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getDefinitions(): Array<Record<string, unknown>> {
    return [...this.tools.values()].map((t) => t.toSchema());
  }

  get toolNames(): string[] {
    return [...this.tools.keys()];
  }

  async execute(name: string, params: Record<string, unknown>): Promise<string> {
    const hint = "\n\n[Analyze the error above and try a different approach.]";
    const tool = this.tools.get(name);
    if (!tool) return `Error: Tool '${name}' not found. Available: ${this.toolNames.join(", ")}`;
    try {
      const errors = tool.validateParams(params);
      if (errors.length) return `Error: Invalid parameters for tool '${name}': ${errors.join("; ")}${hint}`;
      const result = await tool.execute(params);
      if (result.startsWith("Error")) return result + hint;
      return result;
    } catch (err) {
      return `Error executing ${name}: ${String(err)}${hint}`;
    }
  }
}
