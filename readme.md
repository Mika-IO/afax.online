<div align="center">

```text
█████╗ ███████╗ █████╗ ██╗  ██╗
██╔══██╗██╔════╝██╔══██╗╚██╗██╔╝
███████║█████╗  ███████║ ╚███╔╝
██╔══██║██╔══╝  ██╔══██║ ██╔██╗
██║  ██║██║     ██║  ██║██╔╝ ██╗
╚═╝  ╚═╝╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝
```

### Your company on autopilot with AI

**AFAX** — **A**utonomous **F**orce for **A**utomation e**X**ecution

A multi-agent CLI that runs a digital business end-to-end: prospecting, cold outreach,
campaigns, content, CRM, operations and finance — built for **solo founders**,
installable on a **VPS**, working **24/7** and delivering finished work to the CEO: you.

<img alt="node" src="https://img.shields.io/badge/node-%E2%89%A518-339933?logo=node.js&logoColor=white"> <img alt="deps" src="https://img.shields.io/badge/runtime%20deps-0-ff7a1a"> <img alt="tests" src="https://img.shields.io/badge/tests-passing-46a758"> <img alt="license" src="https://img.shields.io/badge/license-MIT-46a758"> <img alt="models" src="https://img.shields.io/badge/LLM-Anthropic%20%C2%B7%20OpenAI%20%C2%B7%20Ollama-8a63d2">

**[Website](https://afax.online)** · **[Documentation](https://afax.online/docs.html)** · **[Quick start](https://afax.online/docs.html#/quickstart)** · **[Run 24/7 on a VPS](https://afax.online/docs.html#/vps)** · **[Roadmap](https://afax.online/docs.html#/roadmap)**

<br>

<img alt="AFAX — natural-language session in the terminal" src="docs/media/afax-cli.svg" width="720">

</div>

---

## What is AFAX?

AFAX is a **zero-dependency Node.js CLI** where seven specialized AI agents — Prospect, Outreach, Marketing, Sales, Content, CRM, Automation, Finance — operate over **your data** with **your LLM keys**, coordinated by an **orchestrator** with persistent memory that plans and executes the highest-leverage next actions on its own.

You don't memorize commands. Plain `afax` opens a **natural-language session** — talk to your company, and AFAX runs the real commands under the hood, showing each one:

```text
$ afax
❯ how are we doing? source 10 leads for dental clinics and draft outreach

⏺ afax status
⏺ afax prospect --target "dental clinics" --limit 10
⏺ afax outreach --channel email --limit 5

● Pipeline is $12,000 across 2 deals, MRR $99. I sourced and scored 10
  leads and drafted 5 personalized cold emails — all dry-run, nothing
  sent. Want me to preview them?
```

Platforms like [GoHighLevel](https://www.gohighlevel.com/) showed one tool can replace a stack of marketing/sales SaaS. Agents like [Polsia](https://polsia.com/) and [Hermes](https://hermes-agent.nousresearch.com/) showed AI can actually *run* operations. AFAX rebuilds those ideas the way a developer wants them: a composable CLI, local-first JSON state, cron-native autonomy, and safety gates in front of everything outbound.

```text
 you (CEO) ──── 💬 chat / ask · goals · approvals · --live
    │
    ▼
 🧠 ORCHESTRATOR ── plans & executes via persistent memory
    │
    ├── 🎯 Prospect    leads sourced, scored, imported ──► 🤝 CRM
    ├── 📨 Outreach    personalized cold email / WhatsApp / Telegram
    ├── 🚀 Marketing   16 channels · campaigns · publishing · paid ads
    ├── ✍️  Content     blog · email · posts · ads · real images
    ├── 💰 Sales       pipeline · weighted forecast · closing ──► 📊 Finance
    ├── 🤖 Automation  event-triggered flows wiring agents together
    └── 📊 Finance     cash flow · MRR/ARR · Stripe invoices · AI CFO
    │            ▲
    ▼            │ events: lead.new · deal.won · message.received · payment.received
 ~/.afax/*.json  │
                 │
 🌐 afax serve ──┘  inbound: replies · payments · webhooks · asset hosting · auto-reply
```

## Highlights

- 💬 **Natural language first** — `afax` is a conversational session (think Claude Code for your company); `afax ask "..."` is the scriptable one-shot.
- 🧠 **Autonomous orchestration** — `afax run --execute`: reads the whole company state, decides the 2–4 highest-leverage moves, executes them, remembers what it did.
- 🌐 **Inbound 2-way** — `afax serve`: webhooks for Telegram/WhatsApp/email/Stripe, an inbox, AI auto-reply in your brand voice, and public hosting for generated images.
- 🔔 **Event-driven flows** — `lead.new`, `deal.won`, `message.received`, `payment.received` fire your automation flows the moment they happen.
- 💳 **Payments** — invoices grow real Stripe payment links; the webhook marks them paid and books revenue automatically.
- 📈 **Paid ads** — `marketing ads` designs the campaign and creates it (paused) in Meta Ads with your budget.
- 🏠 **Local-first** — all state in human-readable JSON under `~/.afax/`. Nothing leaves your machine except the API calls you configure.
- 🔁 **Multi-model** — Anthropic, any OpenAI-compatible endpoint (OpenAI, Groq, OpenRouter, vLLM, LM Studio…), or **Ollama fully offline**. Switch with one command.
- 🔒 **Safe by default** — every outbound action (email, posts, DMs, deploys) is **dry-run** until two explicit gates are open: global `live` **and** per-command `--live`. Enforced at a single choke-point in the code.
- 📦 **Zero runtime dependencies** — only the Node standard library. Even the SMTP client and `.env` loader are built in. Nothing to compile, no supply chain.
- 🏢 **Multi-company** — isolated workspaces per business: own profile, credentials, data, memory. Built for agencies and serial founders.
- 🔌 **Real connectors** — Resend/SendGrid/SMTP email, Meta (Facebook/Instagram/WhatsApp), Telegram/Slack/Discord, Hunter.io lead sourcing, image generation, SSH deploys.
- ⏰ **24/7 on a $5 VPS** — natural-language scheduler + one cron line. No daemon to babysit.

## Quick start

```bash
git clone https://github.com/mika-io/afax.online.git
cd afax.online
npm install -g .                  # creates the `afax` command (Node ≥ 18, instant — no deps)

afax init                         # provider + business profile (~60s)
afax context ingest https://you.com               # AFAX learns your company
afax prospect --target "solo SaaS founders" --limit 10
afax outreach --channel email --limit 5           # drafts only — nothing is sent
afax status                                       # whole-company dashboard
afax run                                          # the orchestrator plans your next moves
```

No global install? `node bin/afax.js <command>` works identically.

<details>
<summary><b>Choose your model</b> (Anthropic · OpenAI-compatible · Ollama)</summary>

```bash
# Anthropic
export ANTHROPIC_API_KEY=sk-ant-...
afax config set provider anthropic
afax config set providers.anthropic.model claude-sonnet-4-6

# OpenAI / Groq / OpenRouter / vLLM / LM Studio…
export OPENAI_API_KEY=sk-...
afax config set provider openai
afax config set providers.openai.baseUrl https://api.openai.com/v1

# Ollama — fully offline, no key
afax config set provider ollama
afax config set providers.ollama.model llama3.1
```

Keys can live in a gitignored `.env`, your shell env, or config. Environment always wins and never touches disk.
</details>

## The agents

| Agent | What it does | Try it |
| --- | --- | --- |
| 🎯 **Prospect** | Lead discovery & qualification — AI profiles with fit scores & buying signals, or **real contacts** via Hunter.io | `afax prospect --target "SaaS founders"` |
| 📨 **Outreach** | Personalized cold messages per lead (email/WhatsApp/Telegram), dry-run pipeline, auto CRM logging | `afax outreach --channel email` |
| 🚀 **Marketing** | 16 acquisition channels, AI campaign design, real multichannel publishing | `afax marketing campaign --channel email --goal "activate trials"` |
| 💰 **Sales** | Pipeline + weighted forecast, AI follow-ups, closing (auto-books revenue) | `afax sales pipeline --deal "Acme" --value 12000` |
| ✍️ **Content** | Blog, email, social, ads, landing copy + **real image generation** | `afax content blog --topic "automation ROI"` |
| 🤝 **CRM** | Unified contacts, stages, dated interaction history | `afax crm contact add "jane@acme.com"` |
| 🤖 **Automation** | Make/Zapier-style flows composing any AFAX commands | `afax automation flow run "welcome"` |
| 📊 **Finance** | Cash flow, MRR/ARR, invoices, 3-bullet AI CFO read-out | `afax finance report` |

## The autonomous loop

```bash
afax config set autonomy execute                  # let the orchestrator act
afax schedule "every day at 09:00" --do "run --execute"
afax schedule "every day at 18:00" \
  --do "marketing publish --platform telegram --topic 'daily status report' --live"

# one cron line = the outbound heartbeat:
*/15 * * * * afax schedule run

# and the inbound ears (systemd/pm2):
afax serve        # webhooks · inbox · AI auto-reply · asset hosting
```

Install on any cheap VPS and the company plans, prospects, writes, **listens** and reports around the clock — full guide: **[Running 24/7 on a VPS](https://afax.online/docs.html#/vps)**.

## Safety model

Nothing is ever sent unless **both** gates are open — one global, one per command:

```bash
afax config set live true                  # gate 1
afax outreach --channel email --live       # gate 2
```

Anything less renders a complete preview (dry-run) and changes nothing externally. All senders route through one guarded dispatcher, so a new connector can't bypass the gate. Set `live false` to freeze the company instantly.

## Documentation

Full docs at **[afax.online/docs.html](https://afax.online/docs.html)** — rendered from the plain markdown in [`docs/`](./docs).

| Getting started | Core | Integrations | Reference |
| --- | --- | --- | --- |
| [Introduction](./docs/introduction.md) | [Orchestrator & autonomy](./docs/orchestrator.md) | [Overview & safety](./docs/integrations.md) | [Command reference](./docs/cli.md) |
| [Installation](./docs/installation.md) | [Company context & memory](./docs/context.md) | [Email](./docs/email.md) · [Meta](./docs/meta.md) | [Architecture](./docs/architecture.md) |
| [Quick start](./docs/quickstart.md) | [Workspaces](./docs/workspaces.md) | [Telegram/Slack/Discord](./docs/messaging.md) | [Troubleshooting](./docs/troubleshooting.md) |
| [💬 Chat](./docs/chat.md) | [Scheduler](./docs/scheduler.md) · [🌐 Server](./docs/server.md) · [VPS 24/7](./docs/vps.md) | [Hunter/Apollo](./docs/leads.md) · [Media](./docs/media.md) · [Deploy](./docs/deploy.md) | [Roadmap](./docs/roadmap.md) · [Contributing](./docs/contributing.md) |
| [Configuration](./docs/configuration.md) | | | |

Plus one page per agent: [Prospect](./docs/prospect.md) · [Outreach](./docs/outreach.md) · [Marketing](./docs/marketing.md) · [Sales](./docs/sales.md) · [Content](./docs/content.md) · [CRM](./docs/crm.md) · [Automation](./docs/automation.md) · [Finance](./docs/finance.md) · [Export/import](./docs/export-import.md)

## Status

**Roadmap: zeroed.** Every planned capability shipped in v0.2.0 — details in the [roadmap](./docs/roadmap.md):

| Capability | Status |
| --- | --- |
| NL chat, 7 agents, orchestrator, outreach drafting, content & image gen + auto-hosting, CRM/sales/finance, event-driven flows, scheduler, inbound server, workspaces | ✅ working |
| Telegram / Slack / Discord publishing | ✅ working |
| Email · Meta (posts, WhatsApp, **paid ads**) · Hunter/Apollo · **Stripe** · SSH deploy | 🔑 needs your keys |

## Development

```bash
npm test                                   # node --test, no frameworks
AFAX_HOME=/tmp/afax-dev node bin/afax.js status   # isolated sandbox
AFAX_DEBUG=1 afax run                      # full stack traces
```

~3,000 lines, zero runtime dependencies, one concern per file. Contributions welcome — read [contributing](./docs/contributing.md) first (keep it dependency-free, add a test, route outbound through the registry).

## License

**[MIT](./LICENSE)** — 100% open source. Use it, fork it, self-host it, build a business on it, forever, no strings attached.

Prefer not to run the infra? **[AFAX Cloud](https://afax.online/#pricing)** is the managed version — same software, hosted, backed up and supported — and it funds the open-source work.

---

<div align="center">
<sub>Built quietly, for builders. ⭐ a star helps more solo founders find their autonomous company.</sub>
</div>
