# Roadmap & status

AFAX is honest about scope. This page is the single source of truth for what is **real today**, what needs **your keys**, and what is **planned**.

## Working today

| Capability | Notes |
| --- | --- |
| 7 agents + orchestrator (`run --execute`) | LLM-driven planning/execution loop with memory |
| Prospecting (AI profiles) | Scored, signal-qualified leads → CRM |
| Cold outreach drafting + preview | Dry-run pipeline, full safety gates |
| Content: blog/email/post/landing/ad | Brand-voice copy from your profile |
| Image generation | OpenAI-compatible endpoints, saved to assets |
| Telegram / Slack / Discord publishing | Webhook & bot API connectors |
| CRM, pipeline + weighted forecast, finance + MRR/ARR | Won deals auto-book revenue |
| Flows, NL scheduler, cron 24/7 | The VPS autonomous loop |
| Multi-company workspaces, export/import | Secret redaction by default |
| Multi-model: Anthropic / OpenAI-compat / Ollama | Switch with one command |

## Working with your keys

| Capability | Needs |
| --- | --- |
| Real email sending | Resend / SendGrid / SMTP credentials + verified domain |
| Facebook / Instagram publishing, WhatsApp outreach | Meta app, long-lived token, IDs |
| Real contact sourcing & verification | Hunter.io key |
| SSH deploys | Your VPS + key |

## Planned

| Capability | Sketch |
| --- | --- |
| **Inbound 2-way** | A small webhook server so replies (email, Telegram, WhatsApp) flow back into the CRM and agents can answer — closing the conversation loop |
| **Asset auto-hosting** | Generated images get a public URL automatically → one-command Instagram posts |
| **Payments** | Stripe: invoices that actually charge, revenue reconciled automatically |
| **Paid-ads APIs** | Meta/Google campaign creation & budget management from the Marketing agent |
| **Event triggers** | `--trigger "new lead"` firing flows automatically instead of describing intent |
| **More lead sources** | Apollo, LinkedIn-export ingestion |

## Versioning

Current: **v0.1.0**. Pre-1.0 the CLI surface may evolve; data files carry a version field (`export` format v1) and future versions will migrate them.

Want something sooner? [Open an issue](https://github.com/mika-io/afax.online/issues) or [contribute](#/contributing).
