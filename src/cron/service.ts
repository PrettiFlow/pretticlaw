import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import parser from "cron-parser";
import type { CronJob, CronSchedule, CronStore } from "./types.js";

function nowMs(): number { return Date.now(); }

function computeNextRun(schedule: CronSchedule, now: number): number | null {
  if (schedule.kind === "at") return schedule.atMs > now ? schedule.atMs : null;
  if (schedule.kind === "every") return schedule.everyMs > 0 ? now + schedule.everyMs : null;
  if (schedule.kind === "cron") {
    try {
      const it = parser.parseExpression(schedule.expr, { currentDate: new Date(now), tz: schedule.tz });
      return it.next().toDate().getTime();
    } catch {
      return null;
    }
  }
  return null;
}

function validateScheduleForAdd(schedule: CronSchedule): void {
  if ("tz" in schedule && schedule.tz && schedule.kind !== "cron") throw new Error("tz can only be used with cron schedules");
  if (schedule.kind === "cron" && schedule.tz) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: schedule.tz });
    } catch {
      throw new Error(`unknown timezone '${schedule.tz}'`);
    }
  }
}

export class CronService {
  private store: CronStore | null = null;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly storePath: string, public onJob?: (job: CronJob) => Promise<string | null>) {}

  private loadStore(): CronStore {
    if (this.store) return this.store;
    if (!fs.existsSync(this.storePath)) {
      this.store = { version: 1, jobs: [] };
      return this.store;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.storePath, "utf8")) as CronStore;
      this.store = parsed;
    } catch {
      this.store = { version: 1, jobs: [] };
    }
    return this.store;
  }

  private saveStore(): void {
    if (!this.store) return;
    fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
    fs.writeFileSync(this.storePath, JSON.stringify(this.store, null, 2), "utf8");
  }

  private getNextWakeMs(): number | null {
    const s = this.loadStore();
    const times = s.jobs.filter((j) => j.enabled && j.state.nextRunAtMs).map((j) => j.state.nextRunAtMs as number);
    return times.length ? Math.min(...times) : null;
  }

  private armTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    const next = this.getNextWakeMs();
    if (!this.running || !next) return;
    this.timer = setTimeout(() => void this.onTimer(), Math.max(0, next - nowMs()));
  }

  private async onTimer(): Promise<void> {
    const s = this.loadStore();
    const now = nowMs();
    const due = s.jobs.filter((j) => j.enabled && j.state.nextRunAtMs && now >= j.state.nextRunAtMs);
    for (const job of due) await this.executeJob(job);
    this.saveStore();
    this.armTimer();
  }

  private async executeJob(job: CronJob): Promise<void> {
    const start = nowMs();
    try {
      if (this.onJob) await this.onJob(job);
      job.state.lastStatus = "ok";
      job.state.lastError = null;
    } catch (err) {
      job.state.lastStatus = "error";
      job.state.lastError = String(err);
    }
    job.state.lastRunAtMs = start;
    job.updatedAtMs = nowMs();
    if (job.schedule.kind === "at") {
      if (job.deleteAfterRun) {
        this.store!.jobs = this.store!.jobs.filter((j) => j.id !== job.id);
      } else {
        job.enabled = false;
        job.state.nextRunAtMs = null;
      }
    } else {
      job.state.nextRunAtMs = computeNextRun(job.schedule, nowMs());
    }
  }

  async start(): Promise<void> {
    this.running = true;
    const s = this.loadStore();
    for (const job of s.jobs) if (job.enabled) job.state.nextRunAtMs = computeNextRun(job.schedule, nowMs());
    this.saveStore();
    this.armTimer();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  listJobs(includeDisabled = false): CronJob[] {
    const s = this.loadStore();
    const jobs = includeDisabled ? s.jobs : s.jobs.filter((j) => j.enabled);
    return [...jobs].sort((a, b) => (a.state.nextRunAtMs ?? Number.MAX_SAFE_INTEGER) - (b.state.nextRunAtMs ?? Number.MAX_SAFE_INTEGER));
  }

  addJob(input: { name: string; schedule: CronSchedule; message: string; deliver?: boolean; channel?: string; to?: string; deleteAfterRun?: boolean }): CronJob {
    const s = this.loadStore();
    validateScheduleForAdd(input.schedule);
    const now = nowMs();
    const job: CronJob = {
      id: randomUUID().slice(0, 8),
      name: input.name,
      enabled: true,
      schedule: input.schedule,
      payload: { kind: "agent_turn", message: input.message, deliver: !!input.deliver, channel: input.channel, to: input.to },
      state: { nextRunAtMs: computeNextRun(input.schedule, now), lastRunAtMs: null, lastStatus: null, lastError: null },
      createdAtMs: now,
      updatedAtMs: now,
      deleteAfterRun: !!input.deleteAfterRun,
    };
    s.jobs.push(job);
    this.saveStore();
    this.armTimer();
    return job;
  }

  removeJob(jobId: string): boolean {
    const s = this.loadStore();
    const before = s.jobs.length;
    s.jobs = s.jobs.filter((j) => j.id !== jobId);
    const removed = s.jobs.length < before;
    if (removed) {
      this.saveStore();
      this.armTimer();
    }
    return removed;
  }

  enableJob(jobId: string, enabled = true): CronJob | null {
    const s = this.loadStore();
    const job = s.jobs.find((j) => j.id === jobId);
    if (!job) return null;
    job.enabled = enabled;
    job.updatedAtMs = nowMs();
    job.state.nextRunAtMs = enabled ? computeNextRun(job.schedule, nowMs()) : null;
    this.saveStore();
    this.armTimer();
    return job;
  }

  async runJob(jobId: string, force = false): Promise<boolean> {
    const s = this.loadStore();
    const job = s.jobs.find((j) => j.id === jobId);
    if (!job) return false;
    if (!force && !job.enabled) return false;
    await this.executeJob(job);
    this.saveStore();
    this.armTimer();
    return true;
  }

  status(): Record<string, unknown> {
    const s = this.loadStore();
    return { enabled: this.running, jobs: s.jobs.length, nextWakeAtMs: this.getNextWakeMs() };
  }
}

export { validateScheduleForAdd };
