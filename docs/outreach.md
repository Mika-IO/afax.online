# 📨 Outreach — personalized cold outreach at scale

The Outreach agent is the sending half of your autonomous SDR. It writes **one template** for a segment — a single LLM call, or zero if you pass your own — then **mail-merges it locally** for every lead. So **N emails cost ~1 LLM call, not N** (the way Instantly/Smartlead/lemlist work). Drafts are held for your approval; nothing leaves until you approve or open both [safety gates](#/integrations).

## How it scales (template + merge, not one call per email)

The old way — one LLM call per lead — doesn't scale and produces near-identical emails at full price. Outreach instead:

1. Writes **one template** with merge variables (`{{first_name}}`, `{{company}}`, `{{title}}`, `{{signal}}`) and light **spintax** (`{Hi|Hey|Hello}`) for natural variation.
2. **Renders locally** for every lead — merge fields filled from your CRM data, a spintax variant picked per lead. No per-lead LLM call.
3. Optionally adds an AI **icebreaker** line with `--personalize` — still just **one** extra batched call for the whole run, not one per lead.

10 leads or 10,000: the same one or two LLM calls.

```bash
afax outreach --channel email --limit 500
afax outreach --channel email --where "signal~POS" --limit 200      # segment
afax outreach --channel email --personalize --limit 100             # + AI icebreaker (1 batched call)
afax outreach --template "Oi {{first_name}}, vi que {{company}} ..." --subject "Sobre {{company}}"  # your own, 0 LLM calls
afax outreach preview                                                # read the latest drafts in full
```

Flags:

| Flag | Meaning | Default |
| --- | --- | --- |
| `--channel` | `email` \| `whatsapp` \| `telegram` | `email` |
| `--limit` | max leads this run (cap 1000) | 25 |
| `--status` | only leads with this status | all not yet `contacted` |
| `--where` | segment filter, `field=val` / `field~substr`, comma = AND | — |
| `--template` / `--subject` | your own template (skips LLM entirely) | — |
| `--personalize` | add a batched AI icebreaker (`{{icebreaker}}`) | off |
| `--live` | request a real send (gate 2) | off |

Targeting: leads with `status ≠ contacted` (or `--status`), filtered by `--where`, up to `--limit`. Each rendered draft is stored in `messages` as `pending` (not sent) until approved.

## Sending the batch

Drafts wait in the [approval queue](#/tasks). Ship them in one shot:

```bash
afax approvals            # review what's prepared
afax approve --all        # real send — emails go out via Resend's batch API (100/call)
```

`approve --all` sends every pending email through Resend's batch endpoint (one HTTP call per 100), records a receipt per message, and flips each lead to `contacted`. No LLM calls on send.

## Going live

```bash
afax config set live true                  # gate 1 — global
afax outreach --channel email --live       # gate 2 — this command
```

On a **real** send (both gates open, connector succeeded):

- the lead's status flips to `contacted` (it won't be targeted again);
- a CRM note is logged on the contact ("Outreach via email: <subject>");
- the message record is marked `delivered`.

On dry-run or failure, status does **not** change, so re-running after a fix targets the same leads.

## Channel requirements

| Channel | Needs | Docs |
| --- | --- | --- |
| `email` | Resend / SendGrid / SMTP configured + verified sender | [Email](#/email) |
| `whatsapp` | Meta access token + WhatsApp Cloud phone-number ID; lead needs a `phone` | [Meta](#/meta) |
| `telegram` | Bot token; the target chat id is taken from the lead | [Messaging](#/messaging) |

## With or without an LLM

To have AFAX **write** the template, you need a model (`afax init`) — it's one call per run. If you'd rather supply your own copy, pass `--template "..." --subject "..."` and outreach runs with **zero** LLM calls, merging your text per lead.

> **Warning:** Cold email is regulated (CAN-SPAM, GDPR, LGPD…). Use a verified domain, include opt-out language where required, keep volumes sane, and only contact people with a legitimate basis. AFAX gives you the gates; compliance is on you.

## A full prospecting → outreach loop

```bash
afax context ingest https://you.com
afax prospect source target-company.com --limit 10
afax outreach --channel email --limit 10        # inspect drafts
afax outreach preview
afax config set live true
afax outreach --channel email --limit 10 --live # send for real
```
