# Architecture

How ~3,000 lines of dependency-free Node.js become an autonomous company. Reading order for the codebase, the data flow, and the design decisions behind them.

## The flow of a command

```text
bin/afax.js
   │  loads .env (never overwrites real env), catches errors (AFAX_DEBUG=1 for traces)
   ▼
src/cli.js — parse() + dispatch()
   │  one router for humans, flows, schedules and the orchestrator alike
   ▼
agent module (src/agents/*.js)
   │  builds prompt = role + business profile + memory + task
   ▼
src/llm/index.js — chat()
   │  one interface; adapters: anthropic.js · openai.js · ollama.js
   │  json:true → strict-JSON instruction + tolerant parser (strips fences/prose)
   ▼
src/store.js — collections in ~/.afax/workspaces/<slug>/data/*.json
   ▼
src/logger.js — tables, headers, spinners, colors (no TTY = plain)
```

Outbound actions take one extra hop: `src/integrations/registry.js`, the **single choke-point** where `live && --live` is enforced before any connector runs.

## Source map

```text
bin/afax.js                 entry: env load, error envelope
src/
├── cli.js                  arg parsing, routing, help, config command
├── chat.js                 NL interface: REPL + ask, runs commands w/ captured output
├── server.js               inbound HTTP: webhooks, inbox, auto-reply, /assets hosting
├── events.js               event bus: lead.new/deal.won/… → matching flows run
├── csv.js                  CSV parser + lead mapping (prospect import)
├── config.js               two-layer config (global + workspace), env overrides
├── paths.js                ~/.afax layout, workspace slugs (no imports — cycle-free root)
├── store.js                JSON collections: read/write/add/update/find, cuid ids
├── memory.js               persistent facts (cap 500), prompt memory blocks
├── env.js                  minimal .env loader
├── logger.js               terminal UI primitives
├── init.js                 interactive setup wizard
├── connect.js              integration wizards + connections table
├── workspace.js            multi-company create/use/list/rm
├── data.js                 export/import with secret redaction
├── orchestrator.js         snapshot → LLM plan → (optional) execution loop
├── scheduler.js            NL intervals, due-task runner
├── llm/                    index (chat + parseJSON) + 3 provider adapters
├── agents/
│   ├── base.js             Agent class: buildSystem(), generate(), structured(), note()
│   ├── context.js          website ingestion → business profile + facts
│   ├── prospect.js  outreach.js  marketing.js  sales.js
│   ├── content.js   crm.js       automation.js finance.js
│   └── deploy.js           ssh/rsync shipping
└── integrations/
    ├── registry.js         guarded publish()/dm() dispatch — the safety gate
    ├── http.js             fetch wrapper with JSON + error normalization
    ├── email.js            Resend / SendGrid / raw SMTP-over-TLS client
    ├── meta.js             FB feed, IG container→publish, WhatsApp Cloud, paid ads
    ├── messaging.js        Telegram / Slack / Discord
    ├── leads.js            Hunter.io / Apollo people search + verifier
    ├── media.js            OpenAI-compatible image generation + hosted URLs
    ├── payments.js         Stripe payment links (form-encoded, zero-dep)
    └── web.js              HTML → readable text (for context ingest)
```

## Data model

All state is per-workspace JSON collections — arrays of records with `cuid`-style ids and ISO timestamps:

```text
~/.afax/
├── config.json                  # global: provider, keys, autonomy, live, activeWorkspace
├── workspaces/<slug>/
│   ├── config.json              # business profile + integrations
│   └── data/
│       ├── leads.json  contacts.json  crm_notes.json
│       ├── deals.json  campaigns.json channels.json
│       ├── content.json  posts.json  messages.json
│       ├── flows.json  schedule.json
│       ├── revenue.json  expenses.json  invoices.json
│       └── memory.json
└── assets/                      # generated images
```

Configuration merges three layers at read time, in increasing precedence: **defaults → files → environment**. Env values are never written back to disk.

## The agent abstraction

Every module instantiates one `Agent` with a key, an emoji, and a role-specific system prompt. The base class contributes the shared machinery:

- `buildSystem()` — composes role + business profile + last 8 memory facts (+ task-specific extra);
- `generate()` / `structured()` — free-form vs JSON-parsed LLM calls;
- `note()` — writes a fact to persistent memory after meaningful actions;
- `online` — whether an LLM is reachable; modules use it to choose AI vs templated fallback.

This is why one `context ingest` improves all eight agents at once: they share the profile and the memory store, not prompts.

## Key decisions

| Decision | Why |
| --- | --- |
| Zero runtime dependencies | No supply chain, instant install, runs on any Node ≥ 18; SMTP and `.env` are ~80 lines each |
| Plain JSON over SQLite | Human-readable, diffable, trivially exportable; volumes here never need indexes |
| One CLI router for everything | Flows, schedules and the orchestrator compose the same commands you type — no second API to maintain |
| Two-gate safety at one choke-point | A new connector physically cannot bypass dry-run; auditable in one screen of code |
| Cron over daemon | Nothing long-running to crash or leak; `schedule run` is idempotent and stateless between invocations |
| Orchestrator menu without senders | The AI builds the company but never cold-emails anyone unless a human (or a human-written schedule) says `--live` |

## Tests

```bash
npm test     # node --test, no frameworks
```

Unit tests cover arg parsing, NL schedule intervals, JSON tolerance of the LLM parser, slugify, workspace isolation, and export redaction.
