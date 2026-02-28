import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Command } from "commander";
import prompts from "prompts";
import chalk from "chalk";
import { loadConfig, saveConfig, getConfigPath, getDataDir } from "../config/loader.js";
import { DEFAULT_CONFIG, getProviderName } from "../config/schema.js";
import { syncWorkspaceTemplates, getWorkspacePath } from "../utils/helpers.js";
import { MessageBus } from "../bus/queue.js";
import { AgentLoop } from "../agent/loop.js";
import { SessionManager } from "../session/manager.js";
import { CronService } from "../cron/service.js";
import type { CronSchedule } from "../cron/types.js";
import { HeartbeatService } from "../heartbeat/service.js";
import { ChannelManager } from "../channels/manager.js";
import { makeProvider } from "../providers/registry.js";
import { startDashboardServer } from "../web/server.js";

const MODEL_CHOICES: Record<string, string[]> = {
   groq: [
    "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
    "meta-llama/llama-4-maverick-17b-128e-instruct",
    "groq/compound",
    "groq/compound-mini",
  ],
  openrouter: [
    "anthropic/claude-opus-4-1",
    "anthropic/claude-sonnet-4",
    "openai/gpt-4.1",
    "google/gemini-2.5-pro",
  ],
  anthropic: [
    "anthropic/claude-opus-4-5",
    "anthropic/claude-sonnet-4",
  ],
openai: [
  "gpt-5.2",
  "gpt-5.2-pro",
  "gpt-5.3-codex",
  "gpt-5.2-codex", 
  "gpt-5.1",
  "gpt-5.1-codex",

  "gpt-5-mini",
  "gpt-5-nano",


  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",

  
  "gpt-4o",
  "gpt-4o-mini",


],
  deepseek: [
    "deepseek/deepseek-chat",
    "deepseek/deepseek-reasoner",
  ],
 
  gemini: [
    "gemini/gemini-2.5-pro",
    "gemini/gemini-2.5-flash",
  ],
  moonshot: [
    "moonshot/kimi-k2.5",
  ],
  minimax: [
    "minimax/MiniMax-M2.1",
  ],
  dashscope: [
    "dashscope/qwen-max",
  ],
  zhipu: [
    "zai/glm-4.5",
  ],
  siliconflow: [
    "openai/deepseek-ai/DeepSeek-R1",
  ],
  volcengine: [
    "volcengine/deepseek-r1-250120",
  ],
  vllm: [
    "hosted_vllm/llama-3.1-8b-instruct",
  ],
  custom: [
    "custom/model-name",
  ],
};

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("pretticlaw")
    .description("pretticlaw - Personal AI Assistant")
    .version("0.1.0", "-v, --version", "show version");

  program.command("onboard").description("Initialize pretticlaw configuration and workspace").action(async () => {
    const configPath = getConfigPath();
    let config = loadConfig();
    if (fs.existsSync(configPath)) {
      console.log(`Config already exists at ${configPath}`);
      const rl = readline.createInterface({ input, output });
      const ans = (await rl.question("Overwrite? [y/N] ")).trim().toLowerCase();
      rl.close();
      if (ans === "y") {
        config = structuredClone(DEFAULT_CONFIG);
        saveConfig(config);
        console.log(`Config reset to defaults at ${configPath}`);
      } else {
        saveConfig(config);
        console.log(`Config refreshed at ${configPath} (existing values preserved)`);
      }
    } else {
      saveConfig(config);
      console.log(`Created config at ${configPath}`);
    }

    const workspace = getWorkspacePath(config.agents.defaults.workspace);
    if (!fs.existsSync(workspace)) {
      fs.mkdirSync(workspace, { recursive: true });
      console.log(`Created workspace at ${workspace}`);
    }
    syncWorkspaceTemplates(workspace);

    if (process.stdin.isTTY && process.stdout.isTTY) {
      console.log(chalk.cyan("\npretticlaw Setup Wizard"));
      console.log(chalk.gray("Use arrow keys to pick options.\n"));

      const providerRes = await prompts({
        type: "select",
        name: "provider",
        message: "Choose your provider",
        choices: [
          { title: "OpenRouter (recommended)", value: "openrouter" },
          { title: "OpenAI", value: "openai" },
          { title: "DeepSeek", value: "deepseek" },
          { title: "Groq", value: "groq" },
          { title: "Moonshot", value: "moonshot" },
          { title: "MiniMax", value: "minimax" },
          { title: "DashScope", value: "dashscope" },
          { title: "Zhipu", value: "zhipu" },
          { title: "SiliconFlow", value: "siliconflow" },
          { title: "VolcEngine", value: "volcengine" },
          { title: "vLLM/Local", value: "vllm" },
          { title: "Custom OpenAI-Compatible", value: "custom" },
        ],
      });
      const provider = String(providerRes.provider || "openrouter");

      const models = MODEL_CHOICES[provider] ?? [config.agents.defaults.model];
      const modelRes = await prompts({
        type: "select",
        name: "model",
        message: "Choose your model",
        choices: models.map((m) => ({ title: m, value: m })),
      });
      const model = String(modelRes.model || models[0]);

      let apiKey = "";
      if (provider !== "vllm") {
        const keyRes = await prompts({
          type: "password",
          name: "apiKey",
          message: "Enter API key",
          validate: (v: string) => (v && v.trim().length > 0 ? true : "API key cannot be empty"),
        });
        apiKey = String(keyRes.apiKey || "");
      }

      config.agents.defaults.provider = provider;
      config.agents.defaults.model = model;
      if (provider in config.providers) {
        config.providers[provider].apiKey = apiKey;
      }
      if (provider === "custom" || provider === "vllm") {
        const baseRes = await prompts({
          type: "text",
          name: "apiBase",
          message: "Enter API base URL",
          initial: provider === "vllm" ? "http://localhost:8000/v1" : "https://api.openai.com/v1",
        });
        const apiBase = String(baseRes.apiBase || "");
        if (provider in config.providers) {
          config.providers[provider].apiBase = apiBase.trim();
        }
      }

      const channelRes = await prompts({
        type: "confirm",
        name: "wantChannel",
        message: "Do you want to configure a chat channel now?",
        initial: true,
      });
      if (channelRes.wantChannel) {
        const chRes = await prompts({
          type: "select",
          name: "channel",
          message: "Choose chat channel",
          choices: [
            { title: "Telegram", value: "telegram" },
            { title: "WhatsApp", value: "whatsapp" },
          ],
        });
        const channel = String(chRes.channel || "telegram");
        if (channel === "telegram") {
          const tokenRes = await prompts({
            type: "password",
            name: "token",
            message: "Enter Telegram Bot Token",
            validate: (v: string) => (v && v.trim().length > 0 ? true : "Token cannot be empty"),
          });
          config.channels.telegram.enabled = true;
          config.channels.telegram.token = String(tokenRes.token || "").trim();
        } else if (channel === "whatsapp") {
          const tokenRes = await prompts({
            type: "password",
            name: "token",
            message: "Enter WhatsApp bridge token",
            validate: (v: string) => (v && v.trim().length > 0 ? true : "Token cannot be empty"),
          });
          config.channels.whatsapp.enabled = true;
          config.channels.whatsapp.bridgeToken = String(tokenRes.token || "").trim();
        }
      }
      saveConfig(config);

      console.log(chalk.green("\nConfigs created."));
      console.log(chalk.yellow("Run prettiflow gateway"));
      console.log(chalk.yellow("or chat with agent: pretticlaw agent"));
      return;
    }

    console.log("\npretticlaw is ready!");
    console.log("Config is non-interactive in this terminal.");
    console.log("Edit ~/.pretticlaw/config.json, then run prettiflow gateway or pretticlaw agent.");
  });

  program
    .command("agent")
    .description("Interact with the agent directly")
    .option("-m, --message <message>", "Message to send to the agent")
    .option("-s, --session <session>", "Session ID", "cli:direct")
    .option("--no-markdown", "Disable markdown rendering")
    .action(async (opts) => {
      const config = loadConfig();
      const workspace = getWorkspacePath(config.agents.defaults.workspace);
      syncWorkspaceTemplates(workspace, true);

      const bus = new MessageBus();
      let provider;
      try {
        provider = makeProvider(config);
      } catch (err) {
        console.log(chalk.red(String(err)));
        return;
      }
      const sessionManager = new SessionManager(workspace);
      const cronPath = path.join(getDataDir(), "cron", "jobs.json");
      const cron = new CronService(cronPath);

      const loop = new AgentLoop({
        bus,
        provider,
        workspace,
        model: config.agents.defaults.model,
        temperature: config.agents.defaults.temperature,
        maxTokens: config.agents.defaults.maxTokens,
        maxIterations: config.agents.defaults.maxToolIterations,
        memoryWindow: config.agents.defaults.memoryWindow,
        braveApiKey: config.tools.web.search.apiKey || null,
        execConfig: config.tools.exec,
        cronService: cron,
        restrictToWorkspace: config.tools.restrictToWorkspace,
        channelsConfig: config.channels,
      });

      if (opts.message) {
        const response = await loop.processDirect(String(opts.message), String(opts.session));
        console.log(`\npretticlaw\n${response}\n`);
      } else {
        console.log("Interactive mode (type exit to quit)");
        const rl = readline.createInterface({ input, output });
        while (true) {
          const line = await rl.question("You: ");
          const command = line.trim().toLowerCase();
          if (["exit", "quit", "/exit", "/quit", ":q"].includes(command)) break;
          const response = await loop.processDirect(line, String(opts.session));
          console.log(`\npretticlaw\n${response}\n`);
        }
        rl.close();
      }
    });

  program.command("gateway")
    .description("Start the pretticlaw gateway")
    .option("-p, --port <port>", "Gateway port", "18790")
    .action(async () => {
      const config = loadConfig();
      const workspace = getWorkspacePath(config.agents.defaults.workspace);
      syncWorkspaceTemplates(workspace, true);

      const bus = new MessageBus();
      let provider;
      try {
        provider = makeProvider(config);
      } catch (err) {
        console.log(chalk.red(String(err)));
        return;
      }
      const cronPath = path.join(getDataDir(), "cron", "jobs.json");
      const cron = new CronService(cronPath);
      const sessionManager = new SessionManager(workspace);
      const loop = new AgentLoop({
        bus,
        provider,
        workspace,
        sessionManager,
        model: config.agents.defaults.model,
        temperature: config.agents.defaults.temperature,
        maxTokens: config.agents.defaults.maxTokens,
        maxIterations: config.agents.defaults.maxToolIterations,
        memoryWindow: config.agents.defaults.memoryWindow,
        braveApiKey: config.tools.web.search.apiKey || null,
        execConfig: config.tools.exec,
        cronService: cron,
        restrictToWorkspace: config.tools.restrictToWorkspace,
        channelsConfig: config.channels,
      });

      cron.onJob = async (job) => {
        const response = await loop.processDirect(job.payload.message, `cron:${job.id}`, job.payload.channel ?? "cli", job.payload.to ?? "direct");
        if (job.payload.deliver && job.payload.to) {
          await bus.publishOutbound({ channel: job.payload.channel ?? "cli", chatId: job.payload.to, content: response });
        }
        return response;
      };

      const channels = new ChannelManager(config, bus);
      const dashboard = startDashboardServer({ agent: loop, cron, config, port: 6767, sessionManager, sessionKey: "web:dashboard" });
      const heartbeat = new HeartbeatService(
        workspace,
        provider,
        loop.model,
        async (tasks) => {
          const sessions = sessionManager.listSessions();
          const first = sessions.find((s: Record<string, string>) => (s.key ?? "").includes(":"))?.key ?? "cli:direct";
          const [channel, chatId] = first.split(/:(.*)/s, 2);
          return loop.processDirect(tasks, "heartbeat", channel || "cli", chatId || "direct");
        },
        async (response) => {
          const sessions = sessionManager.listSessions();
          const first = sessions.find((s: Record<string, string>) => (s.key ?? "").includes(":"))?.key ?? "";
          const [channel, chatId] = first ? first.split(/:(.*)/s, 2) : ["cli", "direct"];
          if (channel !== "cli") await bus.publishOutbound({ channel, chatId, content: response });
        },
        config.gateway.heartbeat.intervalS,
        config.gateway.heartbeat.enabled,
      );

      console.log(chalk.cyan(`Starting pretticlaw gateway on port ${config.gateway.port}...`));
      if (channels.enabledChannels.length) {
        console.log(chalk.green(`Channels enabled: ${channels.enabledChannels.join(", ")}`));
      } else {
        console.log(chalk.yellow("No channels enabled. Gateway will stay idle until channels are configured."));
      }
      console.log(chalk.green(`Dashboard: http://localhost:${dashboard.port}/chat`));
      console.log(chalk.gray("Gateway running. Press Ctrl+C to stop."));

      await cron.start();
      await heartbeat.start();
      await Promise.all([loop.run(), channels.startAll()]);
    });

  const channels = program.command("channels").description("Manage channels");
  channels.command("status").action(() => {
    const config = loadConfig();
    const table = [
      ["WhatsApp", config.channels.whatsapp.enabled ? "yes" : "no", config.channels.whatsapp.bridgeUrl],
      ["Telegram", config.channels.telegram.enabled ? "yes" : "no", config.channels.telegram.token ? `token: ${config.channels.telegram.token.slice(0, 10)}...` : "not configured"],
      ["Discord", config.channels.discord.enabled ? "yes" : "no", config.channels.discord.gatewayUrl],
      ["Feishu", config.channels.feishu.enabled ? "yes" : "no", config.channels.feishu.appId ? `app_id: ${config.channels.feishu.appId.slice(0, 10)}...` : "not configured"],
      ["Mochat", config.channels.mochat.enabled ? "yes" : "no", config.channels.mochat.baseUrl || "not configured"],
      ["DingTalk", config.channels.dingtalk.enabled ? "yes" : "no", config.channels.dingtalk.clientId ? `client_id: ${config.channels.dingtalk.clientId.slice(0, 10)}...` : "not configured"],
      ["Email", config.channels.email.enabled ? "yes" : "no", config.channels.email.imapHost || "not configured"],
      ["Slack", config.channels.slack.enabled ? "yes" : "no", config.channels.slack.appToken && config.channels.slack.botToken ? "socket" : "not configured"],
      ["QQ", config.channels.qq.enabled ? "yes" : "no", config.channels.qq.appId ? `app_id: ${config.channels.qq.appId.slice(0, 10)}...` : "not configured"],
      ["Matrix", config.channels.matrix.enabled ? "yes" : "no", config.channels.matrix.homeserver || "not configured"],
    ];
    for (const row of table) console.log(`${row[0].padEnd(12)} ${row[1].padEnd(3)} ${row[2]}`);
  });

  channels.command("login").description("Link device via QR code").action(() => {
    console.log("Bridge login is not yet implemented in TypeScript port. Use the existing Python bridge flow.");
  });

  const cron = program.command("cron").description("Manage scheduled tasks");
  cron.command("list").option("-a, --all", "Include disabled jobs", false).action((opts) => {
    const service = new CronService(path.join(getDataDir(), "cron", "jobs.json"));
    const jobs = service.listJobs(!!opts.all);
    if (!jobs.length) return console.log("No scheduled jobs.");
    for (const job of jobs) {
      const sched = job.schedule.kind === "every" ? `every ${job.schedule.everyMs / 1000}s` : job.schedule.kind === "cron" ? `${job.schedule.expr} (${job.schedule.tz ?? "local"})` : "one-time";
      const next = job.state.nextRunAtMs ? new Date(job.state.nextRunAtMs).toISOString() : "";
      console.log(`${job.id} | ${job.name} | ${sched} | ${job.enabled ? "enabled" : "disabled"} | ${next}`);
    }
  });

  cron.command("add")
    .requiredOption("-n, --name <name>")
    .requiredOption("-m, --message <message>")
    .option("-e, --every <seconds>")
    .option("-c, --cron <expr>")
    .option("--tz <tz>")
    .option("--at <iso>")
    .option("-d, --deliver", "Deliver response to channel", false)
    .option("--to <recipient>")
    .option("--channel <channel>")
    .action((opts) => {
      if (opts.tz && !opts.cron) {
        console.log("Error: --tz can only be used with --cron");
        process.exitCode = 1;
        return;
      }
      let schedule: CronSchedule;
      if (opts.every) schedule = { kind: "every", everyMs: Number(opts.every) * 1000 };
      else if (opts.cron) schedule = { kind: "cron", expr: String(opts.cron), tz: opts.tz ? String(opts.tz) : undefined };
      else if (opts.at) {
        const dt = new Date(String(opts.at));
        if (Number.isNaN(dt.getTime())) {
          console.log("Error: invalid --at datetime");
          process.exitCode = 1;
          return;
        }
        schedule = { kind: "at", atMs: dt.getTime() };
      } else {
        console.log("Error: Must specify --every, --cron, or --at");
        process.exitCode = 1;
        return;
      }

      const service = new CronService(path.join(getDataDir(), "cron", "jobs.json"));
      try {
        const job = service.addJob({ name: String(opts.name), schedule, message: String(opts.message), deliver: !!opts.deliver, to: opts.to ? String(opts.to) : undefined, channel: opts.channel ? String(opts.channel) : undefined });
        console.log(`Added job '${job.name}' (${job.id})`);
      } catch (err) {
        console.log(`Error: ${String(err).replace(/^Error:\s*/, "")}`);
        process.exitCode = 1;
      }
    });

  cron.command("remove").argument("<jobId>").action((jobId: string) => {
    const service = new CronService(path.join(getDataDir(), "cron", "jobs.json"));
    if (service.removeJob(jobId)) console.log(`Removed job ${jobId}`);
    else console.log(`Job ${jobId} not found`);
  });

  cron.command("enable").argument("<jobId>").option("--disable", "Disable instead", false).action((jobId: string, opts) => {
    const service = new CronService(path.join(getDataDir(), "cron", "jobs.json"));
    const job = service.enableJob(jobId, !opts.disable);
    if (!job) return console.log(`Job ${jobId} not found`);
    console.log(`Job '${job.name}' ${opts.disable ? "disabled" : "enabled"}`);
  });

  cron.command("run").argument("<jobId>").option("-f, --force", "Run even if disabled", false).action(async (jobId: string, opts) => {
    const config = loadConfig();
    const workspace = getWorkspacePath(config.agents.defaults.workspace);
    let provider;
    try {
      provider = makeProvider(config);
    } catch (err) {
      console.log(chalk.red(String(err)));
      process.exitCode = 1;
      return;
    }
    const bus = new MessageBus();
    const loop = new AgentLoop({
      bus,
      provider,
      workspace,
      model: config.agents.defaults.model,
      temperature: config.agents.defaults.temperature,
      maxTokens: config.agents.defaults.maxTokens,
      maxIterations: config.agents.defaults.maxToolIterations,
      memoryWindow: config.agents.defaults.memoryWindow,
      braveApiKey: config.tools.web.search.apiKey || null,
      execConfig: config.tools.exec,
      restrictToWorkspace: config.tools.restrictToWorkspace,
      channelsConfig: config.channels,
    });
    const service = new CronService(path.join(getDataDir(), "cron", "jobs.json"));
    const resultHolder: string[] = [];
    service.onJob = async (job) => {
      const response = await loop.processDirect(job.payload.message, `cron:${job.id}`, job.payload.channel ?? "cli", job.payload.to ?? "direct");
      resultHolder.push(response);
      return response;
    };
    if (await service.runJob(jobId, !!opts.force)) {
      console.log("Job executed");
      if (resultHolder.length) console.log(resultHolder[0]);
    } else {
      console.log(`Failed to run job ${jobId}`);
      process.exitCode = 1;
    }
  });

  program.command("status").description("Show pretticlaw status").action(() => {
    const configPath = getConfigPath();
    const config = loadConfig();
    const workspace = getWorkspacePath(config.agents.defaults.workspace);

    console.log("pretticlaw Status\n");
    console.log(`Config: ${configPath} ${fs.existsSync(configPath) ? "yes" : "no"}`);
    console.log(`Workspace: ${workspace} ${fs.existsSync(workspace) ? "yes" : "no"}`);
    console.log(`Model: ${config.agents.defaults.model}`);

    const names = Object.keys(config.providers);
    for (const name of names) {
      const p = config.providers[name];
      const oauth = ["openai_codex", "github_copilot"].includes(name);
      if (oauth) console.log(`${name}: OAuth`);
      else if (p.apiBase && !p.apiKey) console.log(`${name}: ${p.apiBase}`);
      else console.log(`${name}: ${p.apiKey ? "set" : "not set"}`);
    }
    console.log(`Resolved provider: ${getProviderName(config) ?? "none"}`);
  });

  program.command("doctor").description("Validate provider/model configuration and connectivity").action(async () => {
    const config = loadConfig();
    const providerName = getProviderName(config);
    console.log(chalk.cyan("pretticlaw doctor\n"));
    console.log(`Resolved provider: ${providerName ?? "none"}`);
    console.log(`Model: ${config.agents.defaults.model}`);

    let provider;
    try {
      provider = makeProvider(config);
    } catch (err) {
      console.log(chalk.red(String(err)));
      process.exitCode = 1;
      return;
    }

    try {
      const result = await provider.chat({
        messages: [{ role: "user", content: "Reply with: OK" }],
        model: config.agents.defaults.model,
        maxTokens: 16,
        temperature: 0,
      });
      if ((result.content || "").toLowerCase().includes("error")) {
        console.log(chalk.red(`LLM check failed: ${result.content}`));
        process.exitCode = 1;
        return;
      }
      console.log(chalk.green(`LLM check passed: ${result.content ?? "(empty response)"}`));
      console.log(chalk.green("Config looks good."));
    } catch (err) {
      console.log(chalk.red(`LLM check failed: ${String(err)}`));
      process.exitCode = 1;
    }
  });

  const provider = program.command("provider").description("Manage providers");
  provider.command("login").argument("<provider>").action((providerName: string) => {
    const key = providerName.replace(/-/g, "_");
    if (!["openai_codex", "github_copilot"].includes(key)) {
      console.log(`Unknown OAuth provider: ${providerName}. Supported: openai-codex, github-copilot`);
      process.exitCode = 1;
      return;
    }
    console.log(`OAuth login for ${providerName} is not yet implemented in TypeScript port.`);
  });

  return program;
}
