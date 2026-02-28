import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { describe, expect, test } from "vitest";
import { CronService } from "../src/cron/service.js";

describe("cron timezone", () => {
  test("rejects unknown timezone", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pretticlaw-cron-"));
    const service = new CronService(path.join(dir, "jobs.json"));
    expect(() => {
      service.addJob({
        name: "bad",
        schedule: { kind: "cron", expr: "0 9 * * *", tz: "America/Vancovuer" },
        message: "hello",
      });
    }).toThrow("unknown timezone 'America/Vancovuer'");
  });

  test("accepts valid timezone", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pretticlaw-cron-"));
    const service = new CronService(path.join(dir, "jobs.json"));
    const job = service.addJob({
      name: "good",
      schedule: { kind: "cron", expr: "0 9 * * *", tz: "America/Vancouver" },
      message: "hello",
    });
    expect((job.schedule as any).tz).toBe("America/Vancouver");
    expect(job.state.nextRunAtMs).not.toBeNull();
  });
});
