# Introduction

> **AFAX** — **A**utonomous **F**orce for **A**utomation e**X**ecution. Your company on autopilot with AI.

AFAX is a **zero-dependency Node.js CLI** that runs an autonomous AI company from your terminal. It targets **solo founders of digital businesses** who need a whole back office — prospecting, cold outreach, campaign management, content production, CRM, operations and finance — without hiring a team.

Eight specialized agents operate over **your data** and **your LLM keys**, coordinated by an orchestrator with persistent memory (with a Context step that ingests your company first). Install it on a laptop or a VPS and it works 24/7, **preparing finished work for your approval** — nothing is sent on its own. You review the queue and ship it with one click.

And you don't have to memorize commands: plain `afax` opens a **[natural-language chat](#/chat)** — describe what you want ("find 10 leads and draft outreach"), and AFAX runs the right commands for you, showing each one as it executes.

## Why AFAX exists

Tools like [GoHighLevel](https://www.gohighlevel.com/) prove that a single platform can replace a dozen marketing/sales SaaS subscriptions. Tools like [Polsia](https://polsia.com/) prove that AI agents can run real company operations end-to-end. AFAX takes both ideas and rebuilds them as something a developer actually wants:

- **A CLI, not a dashboard.** Everything is scriptable, cronable, and composable.
- **Local-first.** All state lives under `~/.afax/` — a local SQLite database per workspace (built-in `node:sqlite`) plus plain-JSON config. Nothing leaves your machine except the API calls you explicitly configure.
- **Your keys, your models.** Anthropic, any OpenAI-compatible endpoint (OpenAI, Groq, OpenRouter, vLLM, LM Studio…), or Ollama fully offline.
- **Zero runtime dependencies.** Only the Node standard library. No `node_modules`, no supply-chain surface.
- **Safe by default.** Every outbound action (email, posts, messages, deploys) is **dry-run** until you flip two explicit gates.

## The pipeline, end to end

AFAX covers the full lifecycle of a digital business:

| Stage | Agent | What happens |
| --- | --- | --- |
| Setup · Learn | Context | Ingests your website, extracts offer / ICP / tone into a persistent profile |
| 1. Prospect | 🎯 Prospect | Sources and qualifies leads (AI profiles, or real contacts via Hunter.io) |
| 2. Reach out | 📨 Outreach | Writes personalized cold messages and sends them (email / WhatsApp / Telegram) |
| 3. Market | 🚀 Marketing | 16 acquisition channels, campaign design, multichannel publishing |
| 4. Create | ✍️ Content | Blog posts, emails, social posts, ad copy, landing copy, real image generation |
| 5. Manage | 🤝 CRM | Unified contacts, stages, interaction history |
| 6. Sell | 💰 Sales | Pipeline with weighted forecast, AI follow-ups, closing |
| 7. Operate | 🤖 Automation | Make/Zapier-style flows wiring agents together |
| 8. Account | 📊 Finance | Cash flow, MRR/ARR, invoices, AI CFO read-out |

Above all of them sits the **orchestrator** (`afax run`): it reads the whole company state, decides the highest-leverage next actions, and — if you allow it — executes them on its own. And the loop closes inbound: [`afax serve`](#/server) receives replies, payments and webhooks 24/7, answers with AI when you allow it, and fires your [automation flows](#/automation) on every event.

## Design principles

1. **Honest scope.** Working features are documented as working; planned ones as planned. See the [roadmap](#/roadmap).
2. **Everything is a command.** Flows, schedules and the orchestrator all compose the same CLI subcommands you type by hand.
3. **State you own.** Every collection lives in a local SQLite DB per workspace (`records.db`) — query it with any SQLite tool, export it with `afax export`. Config stays plain JSON.
4. **Two-gate safety.** A global `live` flag **and** a per-command `--live` flag must both be set before anything is sent externally. One gate is never enough.
5. **Offline degradation.** Every command runs without an LLM key (templated output) so the structure of your company never blocks on a provider.

## Where to go next

- [Installation](#/installation) — get the `afax` command in two minutes.
- [Quick start](#/quickstart) — from zero to first orchestrator run.
- [Architecture](#/architecture) — how the pieces fit together.
- [Running 24/7 on a VPS](#/vps) — the always-on company.
