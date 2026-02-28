import { Tool } from "./base.js";
import type { CronService } from "../../cron/service.js";
import type { CronSchedule } from "../../cron/types.js";

export class CronTool extends Tool {
  readonly name = "cron";
  readonly description = "Schedule reminders and recurring tasks. Actions: add, list, remove.";
  readonly parameters = {
    type: "object",
    properties: {
      action: { type: "string", enum: ["add", "list", "remove"] },
      message: { type: "string" },
      every_seconds: { type: "integer" },
      cron_expr: { type: "string" },
      tz: { type: "string" },
      at: { type: "string" },
      job_id: { type: "string" },
    },
    required: ["action"],
  };

  private channel = "";
  private chatId = "";

  constructor(private readonly cron: CronService) { super(); }

  setContext(channel: string, chatId: string): void {
    this.channel = channel;
    this.chatId = chatId;
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const action = String(args.action ?? "");
    if (action === "add") return this.addJob(args);
    if (action === "list") return this.listJobs();
    if (action === "remove") return this.removeJob(String(args.job_id ?? ""));
    return `Unknown action: ${action}`;
  }

  private addJob(args: Record<string, unknown>): string {
    const message = String(args.message ?? "");
    if (!message) return "Error: message is required for add";
    if (!this.channel || !this.chatId) return "Error: no session context (channel/chat_id)";

    const every = args.every_seconds != null ? Number(args.every_seconds) : null;
    const cronExpr = args.cron_expr != null ? String(args.cron_expr) : null;
    const tz = args.tz != null ? String(args.tz) : null;
    const at = args.at != null ? String(args.at) : null;

    let schedule: CronSchedule;
    let deleteAfterRun = false;
    if (every) schedule = { kind: "every", everyMs: every * 1000 };
    else if (cronExpr) schedule = { kind: "cron", expr: cronExpr, tz: tz ?? undefined };
    else if (at) {
      const dt = new Date(at);
      if (Number.isNaN(dt.getTime())) return "Error: invalid ISO datetime in at";
      schedule = { kind: "at", atMs: dt.getTime() };
      deleteAfterRun = true;
    } else return "Error: either every_seconds, cron_expr, or at is required";

    try {
      const job = this.cron.addJob({ name: message.slice(0, 30), schedule, message, deliver: true, channel: this.channel, to: this.chatId, deleteAfterRun });
      return `Created job '${job.name}' (id: ${job.id})`;
    } catch (err) {
      return `Error: ${String(err).replace(/^Error:\s*/, "")}`;
    }
  }

  private listJobs(): string {
    const jobs = this.cron.listJobs();
    if (!jobs.length) return "No scheduled jobs.";
    return `Scheduled jobs:\n${jobs.map((j) => `- ${j.name} (id: ${j.id}, ${j.schedule.kind})`).join("\n")}`;
  }

  private removeJob(id: string): string {
    if (!id) return "Error: job_id is required for remove";
    return this.cron.removeJob(id) ? `Removed job ${id}` : `Job ${id} not found`;
  }
}
