<div align="center">
  <img src="https://prettiflow.tech/claw.png" alt="Pretticlaw" width="250">
  <h1>Pretticlaw</h1>
  <p>
    <a href="https://www.npmjs.com/package/pretticlaw">
      <img src="https://img.shields.io/npm/v/pretticlaw.svg?style=flat-square" alt="npm version" />
    </a>
    <a href="https://www.npmjs.com/package/pretticlaw">
      <img src="https://img.shields.io/npm/dt/pretticlaw.svg?style=flat-square" alt="npm downloads" />
    </a>
    <a href="https://www.npmjs.com/package/pretticlaw">
      <img src="https://img.shields.io/badge/npm-link-blue?style=flat-square" alt="npm link" />
    </a>
  </p>
  <p><strong>Lightweight AI Assistant That Lives in Your Computer.</strong></p>
  <p>Inspired by <a href="https://openclaw.ai">OpenClaw</a>.</p>
  <p>
    <a href="https://prettiflow.tech/claw"><strong>prettiflow.tech/claw</strong></a>
    · <a href="https://prettiflow.tech">prettiflow.tech</a>
    · <a href="https://openclaw.ai">openclaw.ai</a>
    · <a href="https://github.com/prettiflow/pretticlaw/blob/main/LICENSE">MIT</a>
  </p>
</div>

---

## What is Pretticlaw?

Pretticlaw is a **minimal yet full-featured** agent platform that ships with:

- Zero boilerplate CLI: `pretticlaw agent`, `pretticlaw gateway`, `pretticlaw doctor`.
- A **rich browser dashboard** on port 6767 with tabs for chat, channels, cron, settings, and status.
- Tool-call aware chat + spinner/hover cues + live channel/cron wiring.
- Multi-provider support: <a href="https://platform.openai.com">OpenAI</a>, <a href="https://docs.anthropic.com">Anthropic</a>, <a href="https://console.groq.com">Groq</a>, <a href="https://openrouter.ai">OpenRouter</a>, and more, all tuned for tool-call support.

Part of the <a href="https://prettiflow.tech">Prettiflow</a> ecosystem, the first infrastructure for AI-built software.

## Use Cases

### 📈 Around-the-Clock Market Intelligence

Pretticlaw can monitor stocks, crypto, forex, and commodities in real time, delivering automated alerts, trend summaries, and portfolio snapshots while you sleep. Set up a cron job and wake up to a full market briefing every morning.

### 🚀 Your Software Engineer Intern

Need a REST API scaffolded, a React dashboard wired up, or a database migration written? Pretticlaw reads your codebase, writes production-grade code, runs shell commands, and iterates on bugs, acting as a full-stack engineer that never clocks out.

### 📅 Intelligent Daily Planner

From scheduling meetings to sending reminders and organizing your to-do list, Pretticlaw manages your daily workflow. It learns your habits through memory, prioritizes tasks, and keeps your routine on track with scheduled heartbeat check-ins.

### 📚 Personal Research and Knowledge Companion

Ask Pretticlaw anything: summarize a paper, search the web for the latest docs, compile notes from multiple sources, or maintain a personal knowledge base. It fetches, reads, and distills information so you can focus on what matters.

## Quick Install

```bash
npm install -g pretticlaw
pretticlaw onboarding
pretticlaw gateway         # start gateway + dashboard
pretticlaw agent -m "Hello"
```

## Running Locally

1. **Global binary**: `pretticlaw` is published as an npm CLI (call `pretticlaw --help`).
2. **Development**: clone the <a href="https://github.com/prettiflow/pretticlaw">repo</a>, run `npm install`, `npm run build`, `npm link` to test changes.
3. **Dashboard**: while the gateway runs, visit <a href="http://localhost:6767/chat">`http://localhost:6767/chat`</a> to interact, adjust channels, tweak cron jobs, or inspect status.

## Providers

Pretticlaw supports multiple LLM providers out of the box:

| Provider | Link | Notes |
|---|---|---|
| **OpenAI** | <a href="https://platform.openai.com">platform.openai.com</a> | GPT-4o, GPT-4, GPT-3.5, full tool-call support |
| **Anthropic** | <a href="https://docs.anthropic.com">docs.anthropic.com</a> | Claude 4, Claude 3.5 Sonnet, tool-use ready |
| **Groq** | <a href="https://console.groq.com">console.groq.com</a> | GPT-OSS-120B, Llama 4, ultra-fast inference |
| **OpenRouter** | <a href="https://openrouter.ai">openrouter.ai</a> | Unified access to 200+ models |
| **Custom** | - | Any OpenAI-compatible endpoint |

Configure your provider during `pretticlaw onboarding` or via `~/.pretticlaw/config.json`.

## Channel Onboarding

`pretticlaw onboarding` walks you through:
1. Provider / model / API key selection.
2. Whether you want a chat channel (Telegram / WhatsApp).
3. Channel token input, stored directly in `~/.pretticlaw/config.json`.

Want to tweak later? Update the dashboard <a href="http://localhost:6767/channels">`/channels`</a> tab or edit `~/.pretticlaw/config.json`.

## Cron + Heartbeat

- Add jobs with `pretticlaw cron add --name "digest" --every 3600 --message "report"`.
- List jobs: `pretticlaw cron list`.
- Run a job: `pretticlaw cron run <id>`.
- Heartbeat wakes every 30m and executes tasks in `~/.pretticlaw/workspace/HEARTBEAT.md`.

## Command Reference

| Command | Purpose |
|---|---|
| `pretticlaw onboard` | Scaffold config/workspace + optional channel token wizard |
| `pretticlaw agent` | Chat interactively (arrow keys + tool hints) |
| `pretticlaw agent -m "<msg>"` | One-off agent request |
| `pretticlaw gateway` | Start gateway + dashboard (listen on `[port]/chat`) |
| `pretticlaw doctor` | Validate provider/model configuration |
| `pretticlaw channels status` | Show channel health |
| `pretticlaw channels login` | Link WhatsApp |
| `pretticlaw status` | Print provider/model/channel summary |
| `pretticlaw cron ...` | Manage scheduled jobs |

You can also edit channels/config from the dashboard. The server automatically saves your choices.


## 🌐 Agent Social Network

Pretticlaw is capable of linking to the **Agent Social Network** (agent community). Just send one message and your Pretticlaw joins automatically!

| Platform | How to Join (send this message to your Pretticlaw) |
|---|---|
| <a href="https://moltbook.com">Moltbook</a> | `Read https://moltbook.com/skill.md and follow the instructions to join Moltbook` |
| <a href="https://clawdchat.ai">ClawdChat</a> | `Read https://clawdchat.ai/skill.md and follow the instructions to join ClawdChat` |

Simply send the command above to your Pretticlaw (via CLI or any chat channel), and it will handle the rest.

## Architecture

- **Data model**: Session/cron/heartbeat patterns. JSONL sessions, CronService persistence, heartbeat triggers.
- **Providers**: <a href="https://platform.openai.com">OpenAI</a> · <a href="https://docs.anthropic.com">Anthropic</a> · <a href="https://console.groq.com">Groq</a> · <a href="https://openrouter.ai">OpenRouter</a> + local custom endpoints via Litellm.
- **Tools**: exec/read/write/list/edit, web search/fetch, cron, spawn message tool.
- **Dashboard**: React (ESM) served via lightweight HTTP handler from assets copied into `dist/dashboard`.

## Links

| | |
|---|---|
| **Prettiflow** | <a href="https://prettiflow.tech">prettiflow.tech</a> |
| **Pretticlaw** | <a href="https://prettiflow.tech/claw">prettiflow.tech/claw</a> |

## Contributing

We welcome contributions! Please see <a href="./CONTRIBUTING.md">CONTRIBUTING.md</a> for guidelines.

## Contact

Reach the team at <a href="mailto:team@prettiflow.tech">team@prettiflow.tech</a>.

## Getting Help

- File issues on the <a href="https://github.com/prettiflow/pretticlaw/issues">repo</a>.
- Email us at <a href="mailto:team@prettiflow.tech">team@prettiflow.tech</a>.
- For quick debugging, run `pretticlaw doctor` and view errors on the dashboard.

---

<div align="center">
  <sub>Built by <a href="https://prettiflow.tech">Prettiflow</a> · Inspired by <a href="https://openclaw.ai">OpenClaw</a></sub>
</div>
