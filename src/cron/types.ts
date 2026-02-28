export type CronSchedule =
  | { kind: "at"; atMs: number; everyMs?: never; expr?: never; tz?: string }
  | { kind: "every"; everyMs: number; atMs?: never; expr?: never; tz?: string }
  | { kind: "cron"; expr: string; tz?: string; atMs?: never; everyMs?: never };

export interface CronPayload {
  kind: "system_event" | "agent_turn";
  message: string;
  deliver: boolean;
  channel?: string;
  to?: string;
}

export interface CronJobState {
  nextRunAtMs: number | null;
  lastRunAtMs: number | null;
  lastStatus: "ok" | "error" | "skipped" | null;
  lastError: string | null;
}

export interface CronJob {
  id: string;
  name: string;
  enabled: boolean;
  schedule: CronSchedule;
  payload: CronPayload;
  state: CronJobState;
  createdAtMs: number;
  updatedAtMs: number;
  deleteAfterRun: boolean;
}

export interface CronStore {
  version: number;
  jobs: CronJob[];
}
