# 🎯 Prospect — lead discovery & qualification

The Prospect agent is your autonomous SDR's research half: it builds qualified lead lists matching your ICP, scores fit, and identifies buying signals. Every saved lead is mirrored into the [CRM](#/crm) automatically.

## AI-qualified lead profiles

```bash
afax prospect --target "solo SaaS founders" --limit 20
```

- `--target` — who you're hunting (defaults to the first positional argument).
- `--limit` — how many leads (default 10, max 50).

The agent uses your business profile + memory and returns structured leads: `name`, `title`, `company`, `industry`, `email`, `score` (0–100 fit vs your ICP), and `signal` (the buying/intent signal that qualifies them). Results are saved with `status: new` and ranked by score in the output table.

> **Note:** AI-generated emails are plausible patterns (`first.last@company.com`) and are **flagged unverified** — the agent never fabricates real personal contact data. For real, verifiable contacts use `prospect source`.

Without an LLM key the command still works, generating clearly-labeled template leads so you can exercise the pipeline.

## Real contacts via Hunter.io

```bash
afax prospect source acme.com --limit 10
```

Queries the [Hunter.io](https://hunter.io) Domain Search API and returns **real** people at that company: name, title, verified business email, confidence score and department signal. Requires the [leads integration](#/leads):

```bash
afax connect leads          # or: export HUNTER_API_KEY=...
```

## Verify a single email

```bash
afax prospect verify jane@acme.com
# → jane@acme.com → deliverable (score 92)
```

Uses Hunter's Email Verifier to check deliverability before you burn sender reputation.

## Where leads go

- Collection `leads` — full lead record, `status: new` → `contacted` (set automatically on a real outreach send).
- Collection `contacts` — CRM mirror at stage `lead` (deduplicated by email).

## Typical chains

```bash
# Research → outreach
afax prospect --target "indie hackers with paid products" --limit 10
afax outreach --channel email --limit 5

# Real contacts → verified outreach
afax prospect source competitor-customer.com
afax prospect verify ceo@competitor-customer.com
afax outreach --channel email --live      # after enabling live mode
```
