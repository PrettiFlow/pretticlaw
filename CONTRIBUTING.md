# Contributing to Pretticlaw

Thank you for your interest in contributing to **Pretticlaw**! We welcome contributions from everyone.

## Getting Started

1. **Fork** the repository on [GitHub](https://github.com/prettiflow/pretticlaw).
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/<your-username>/pretticlaw.git
   cd pretticlaw
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Build** the project:
   ```bash
   npm run build
   ```
5. **Link** for local testing:
   ```bash
   npm link
   ```

## Development Workflow

1. Create a new branch from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```
2. Make your changes.
3. Run the build to verify everything compiles:
   ```bash
   npm run build
   ```
4. Run tests:
   ```bash
   npm test
   ```
5. Commit your changes with a clear message:
   ```bash
   git commit -m "feat: add support for new provider"
   ```
6. Push and open a Pull Request against `main`.

## Commit Convention

We use conventional commits:

| Prefix | Usage |
|---|---|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `refactor:` | Code change that neither fixes a bug nor adds a feature |
| `test:` | Adding or updating tests |
| `chore:` | Tooling, CI, or dependency updates |

## Project Structure

```
src/
├── agent/         # Agent loop, context, memory, skills, tools
├── bus/           # Event bus and async queue
├── channels/      # Discord, Telegram, stub channels
├── cli/           # CLI commands
├── config/        # Config loader and schema
├── cron/          # Cron service and types
├── dashboard/     # Dashboard HTML assets
├── heartbeat/     # Heartbeat service
├── providers/     # LLM providers (OpenAI, Anthropic, Groq, OpenRouter, custom)
├── session/       # Session manager
├── skills/        # Built-in skills (cron, github, memory, weather, etc.)
├── templates/     # Agent prompt templates
├── utils/         # Helpers
└── web/           # Web server for dashboard
```

## Adding a New Provider

1. Create a new file in `src/providers/` (e.g., `my-provider.ts`).
2. Extend `BaseProvider` from `src/providers/base.ts`.
3. Register it in `src/providers/registry.ts`.
4. Add any config schema changes to `src/config/schema.ts`.

## Adding a New Tool

1. Create a new file in `src/agent/tools/` (e.g., `my-tool.ts`).
2. Extend `BaseTool` from `src/agent/tools/base.ts`.
3. Register it in `src/agent/tools/registry.ts`.

## Adding a New Skill

1. Create a new directory under `src/skills/` (e.g., `src/skills/my-skill/`).
2. Add a `SKILL.md` file describing the skill.
3. The skill will be auto-discovered at runtime.

## Code Style

- **TypeScript** — all source code lives in `src/` and compiles to `dist/`.
- Follow existing patterns and conventions in the codebase.
- Keep functions small and focused.
- Prefer explicit types over `any`.

## Reporting Issues

Please [open an issue](https://github.com/prettiflow/pretticlaw/issues) with:
- A clear description of the problem.
- Steps to reproduce.
- Expected vs. actual behavior.
- Your environment (OS, Node version, Pretticlaw version).

## Links

- [Prettiflow](https://prettiflow.tech) — our main platform
- [Pretticlaw](https://prettiflow.tech/claw) — this project

---

<div align="center">
  <sub>Built with ❤️ by the <a href="https://prettiflow.tech">Prettiflow</a> team</sub>
</div>
