# Quick start

From zero to a working autonomous company in about five minutes. This walkthrough assumes you finished [Installation](#/installation).

## 1. Configure provider and business profile

```bash
afax init
```

Pick a provider, paste a key (or leave blank and use an env var), describe your company. The business profile powers **every** agent — the better it is, the better every output gets.

## 2. Let AFAX learn your company

```bash
afax context ingest https://yourcompany.com
```

AFAX fetches your homepage (plus `/about`, `/pricing`, `/product` when they exist), extracts your **offer**, **ICP**, **tone**, key facts and value props, and stores them in the profile + persistent memory. From now on, every agent writes like your company. Details: [Company context](#/context).

## 3. Source and qualify leads

```bash
afax prospect --target "solo SaaS founders" --limit 10
```

The Prospect agent generates qualified lead profiles with fit scores (0–100) and buying signals, and mirrors each one into the CRM.

Want **real, verifiable contacts** instead? Connect [Hunter.io](#/leads) and run:

```bash
afax prospect source acme.com --limit 10
```

## 4. Draft personalized cold outreach

```bash
afax outreach --channel email --limit 5
afax outreach preview
```

The Outreach agent writes one short, specific, human message per lead. **Nothing is sent** — this is a dry-run by default. Read [Safety: dry-run vs live](#/integrations) before going live.

## 5. See the whole company

```bash
afax status
```

One screen: leads, contacts, channels, campaigns, content, pipeline, won revenue, flows, MRR, net.

## 6. Let the orchestrator plan

```bash
afax run
```

The orchestrator reads the full company state plus its memory of recent actions, and proposes the 2–4 highest-leverage next moves with reasoning. To let it act:

```bash
afax run --execute            # runs up to 4 actions (cap with --steps N)
```

## 7. Build the rest of the company

```bash
# Content production
afax content blog --topic "why solo founders automate"
afax content image --prompt "minimal orange A logo on black"

# Campaigns across 16 channels
afax marketing channel list
afax marketing campaign --channel email --goal "activate trials"

# Pipeline
afax sales pipeline --deal "Acme Enterprise" --value 12000 --stage proposal
afax sales followup --deal "Acme Enterprise"

# Money
afax finance revenue --source "Acme" --amount 99 --type subscription
afax finance report
```

## 8. Or just talk to it

Skip memorizing commands — plain `afax` opens a conversational session that runs everything above for you:

```text
$ afax
❯ source 10 leads for dental clinics and draft cold emails for the best 5
⏺ afax prospect --target "dental clinics" --limit 10
⏺ afax outreach --channel email --limit 5
● Done — 10 leads scored and saved, 5 personalized drafts ready (dry-run)…
```

Details: [Chat](#/chat).

## 9. Make it autonomous

```bash
afax config set autonomy execute
afax schedule "every day at 09:00" --do "run --execute"
```

Then wire the scheduler to cron — and run [`afax serve`](#/server) so replies, payments and webhooks flow back in. Full guide: [Running on a VPS](#/vps).

## What next

- [The orchestrator](#/orchestrator) — how AFAX decides what to do.
- [Integrations](#/integrations) — connect email, Meta, Telegram, Hunter, image generation.
- [Workspaces](#/workspaces) — run several companies side by side.
