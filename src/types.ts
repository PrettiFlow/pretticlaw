export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export function nowIso(): string {
  return new Date().toISOString();
}
