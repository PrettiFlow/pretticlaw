export abstract class Tool {
  protected static typeMap: Record<string, (v: unknown) => boolean> = {
    string: (v) => typeof v === "string",
    integer: (v) => Number.isInteger(v),
    number: (v) => typeof v === "number" && Number.isFinite(v),
    boolean: (v) => typeof v === "boolean",
    array: (v) => Array.isArray(v),
    object: (v) => !!v && typeof v === "object" && !Array.isArray(v),
  };

  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly parameters: Record<string, unknown>;
  abstract execute(args: Record<string, unknown>): Promise<string>;

  validateParams(params: Record<string, unknown>): string[] {
    const schema = (this.parameters ?? {}) as Record<string, unknown>;
    if ((schema.type as string | undefined) !== "object") {
      throw new Error(`Schema must be object type, got ${String(schema.type)}`);
    }
    return this.validateValue(params, { ...schema, type: "object" }, "parameter");
  }

  private validateValue(value: unknown, schema: Record<string, unknown>, label: string): string[] {
    const t = schema.type as string | undefined;
    const errors: string[] = [];
    if (t && Tool.typeMap[t] && !Tool.typeMap[t](value)) return [`${label} should be ${t}`];

    if (schema.enum && !((schema.enum as unknown[]).includes(value))) errors.push(`${label} must be one of ${JSON.stringify(schema.enum)}`);
    if (t === "integer" || t === "number") {
      if (typeof value === "number") {
        if (typeof schema.minimum === "number" && value < schema.minimum) errors.push(`${label} must be >= ${schema.minimum}`);
        if (typeof schema.maximum === "number" && value > schema.maximum) errors.push(`${label} must be <= ${schema.maximum}`);
      }
    }
    if (t === "string" && typeof value === "string") {
      if (typeof schema.minLength === "number" && value.length < schema.minLength) errors.push(`${label} must be at least ${schema.minLength} chars`);
      if (typeof schema.maxLength === "number" && value.length > schema.maxLength) errors.push(`${label} must be at most ${schema.maxLength} chars`);
    }
    if (t === "object" && value && typeof value === "object" && !Array.isArray(value)) {
      const v = value as Record<string, unknown>;
      const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
      for (const req of (schema.required ?? []) as string[]) {
        if (!(req in v)) errors.push(`missing required ${label === "parameter" ? req : `${label}.${req}`}`);
      }
      for (const [k, child] of Object.entries(v)) {
        if (props[k]) errors.push(...this.validateValue(child, props[k], label === "parameter" ? k : `${label}.${k}`));
      }
    }
    if (t === "array" && Array.isArray(value) && schema.items && typeof schema.items === "object") {
      value.forEach((item, i) => errors.push(...this.validateValue(item, schema.items as Record<string, unknown>, `${label}[${i}]`)));
    }
    return errors;
  }

  toSchema(): Record<string, unknown> {
    return { type: "function", function: { name: this.name, description: this.description, parameters: this.parameters } };
  }
}
