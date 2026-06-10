# 💬 Chat — talk to your company

Run `afax` with no arguments and you're in a conversational session — the same feel as Claude Code, but the agent is your company. You speak natural language; AFAX answers in natural language and **runs real commands under the hood**, showing you each one as it executes.

```text
$ afax

  ▰▰▰ AFAX · Acme Clinics · anthropic
  Talk to your company in natural language — I run the commands.

❯ how are we doing?

● Pipeline is at $12,000 across 2 open deals, MRR is $99, and you have
  14 fresh leads that were never contacted. Want me to draft outreach?

❯ yes, draft outreach for the top 5 and show me the first one

⏺ afax outreach --channel email --limit 5
⏺ afax outreach preview

● Done — 5 personalized drafts are ready (dry-run, nothing sent). The
  first one to Jane at Acme leads with their hiring signal…
```

## What it can do

- **Answer questions about your business** — it sees the live company snapshot (leads, pipeline, MRR…), your business profile, and the agents' persistent memory.
- **Act** — it has the full AFAX command surface: prospect, outreach, content, campaigns, deals, finance, schedules, flows… It runs up to 5 commands per turn, reads their output, and can chain further commands before answering.
- **Answer questions about AFAX itself** — "how do I connect Stripe?", "what does --live do?", "how do I run this 24/7?".

Every executed command is printed as a dim `⏺ afax …` line with its full output — nothing happens invisibly.

## One-shot mode: `afax ask`

Scriptable single question, same engine:

```bash
afax ask "what changed since yesterday?"
afax ask "do we have any deal stuck in proposal? what should I do?"
```

## Safety

- Chat **respects the same two gates** as everything else: it won't really send anything unless global `live` is on **and** it passes `--live` — which it is instructed to do only when you clearly asked for a real send.
- Interactive commands (`init`, `connect`) and recursive ones (`chat`, `serve`) are blocked from auto-execution — it tells you to run them yourself.
- Max 5 commands per turn, so a confused model can't run away.

## Requirements & tips

- Needs an LLM (`afax init`); every non-chat command still works without one.
- `afax` with no args falls back to `afax help` when no LLM is configured or stdin isn't a terminal (so cron/scripts never accidentally open a chat).
- The better your [company context](#/context), the smarter the answers — ingest your site first.
- Type `exit` (or Ctrl+C) to leave.
