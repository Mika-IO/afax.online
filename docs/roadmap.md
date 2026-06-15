# Roadmap & status

AFAX is honest about scope. As of **v0.2.0 every planned capability is implemented** — the table below is the single source of truth for what runs out of the box vs what needs your keys.

## Working out of the box

| Capability | Notes |
| --- | --- |
| 💬 Natural-language chat (`afax` / `afax ask`) | Conversational interface that runs commands under the hood |
| 8 agents + orchestrator (`run --execute`) | LLM-driven planning/execution loop with memory |
| Prospecting (AI profiles) + CSV import | LinkedIn/Apollo/generic exports via `prospect import` |
| Cold outreach drafting + preview | Dry-run pipeline, full safety gates |
| Content: blog/email/post/landing/ad | Brand-voice copy from your profile |
| Image generation + **auto-hosting** | Public URLs via `afax serve` → one-command Instagram |
| Telegram / Slack / Discord publishing | Webhook & bot API connectors |
| CRM, pipeline + weighted forecast, finance + MRR/ARR | Won deals auto-book revenue |
| Flows + **real event triggers** | `lead.new`, `deal.won`, `message.received`, `payment.received` fire flows automatically |
| NL scheduler + cron 24/7 | The VPS autonomous loop |
| 🌐 **Inbound server** (`afax serve`) | Webhooks for Telegram/WhatsApp/email/Stripe, inbox, AI auto-reply |
| Multi-company workspaces, export/import | Secret redaction by default |
| Multi-model: Anthropic / OpenAI-compat / Ollama | Switch with one command |

## Working with your keys

| Capability | Needs |
| --- | --- |
| Real email sending | Resend / SendGrid / SMTP credentials + verified domain |
| Facebook / Instagram publishing, WhatsApp outreach + inbound | Meta app, long-lived token, IDs |
| 💳 **Payments** — Stripe payment links on invoices, auto-paid via webhook | Stripe secret key (+ webhook signing secret) |
| 📈 **Paid ads** — Meta campaign + ad set created (paused) from the CLI | Meta token + ad account ID |
| Real contact sourcing | Hunter.io **or** Apollo key |
| Email verification | Hunter.io key |
| AI auto-reply to inbound | Any LLM + `autoreply` + global `live` |
| SSH deploys | Your VPS + key |

## Formerly planned — now shipped

| Was planned | Shipped as |
| --- | --- |
| Inbound 2-way (auto-reply server) | [`afax serve`](#/server) — webhooks, inbox, AI auto-reply |
| Image auto-hosting → Instagram | [`/assets` hosting](#/server) + transparent local-file hosting in `marketing publish` |
| Payments (Stripe) | [`finance invoice --live`](#/finance) + `/webhook/stripe` reconciliation |
| Paid-ads APIs | [`marketing ads`](#/marketing) — Meta campaign/ad set, created paused |
| Event triggers for flows | [Event bus](#/automation) wired into all agents |
| More lead sources | [`prospect import` CSV](#/prospect) + [Apollo driver](#/leads) |
| Natural-language interface | [`afax` chat / `afax ask`](#/chat) |

## What's next

Nothing is promised. Ideas under consideration: Google Ads, two-way email threading, a read-only web dashboard. Want one? [Open an issue](https://github.com/mika-io/afax.online/issues) or [contribute](#/contributing).

## Versioning

Current: **v0.2.0**. Pre-1.0 the CLI surface may evolve; data files carry a version field (`export` format v1) and future versions will migrate them.
