# Integrations & safety

AFAX ships real HTTP connectors — no SDKs, no dependencies, each using **your** credentials. Everything is off until you turn it on, and every outbound action is **dry-run by default**.

## Safety: the two gates

> **Warning:** Nothing is ever sent unless **both** gates are open. This is enforced at a single choke-point in the code that every outbound action (email, posts, DMs) must pass through.

```bash
# Gate 1 — global flag (or AFAX_LIVE=1 in the environment)
afax config set live true

# Gate 2 — per-command opt-in
afax outreach --channel email --live
afax marketing publish --platform telegram --message "hi" --live
afax deploy --src ./dist --live
```

With one gate or none, AFAX renders a full preview of exactly what *would* be sent, records it as a dry-run, and changes nothing externally. To freeze everything instantly:

```bash
afax config set live false
```

## Connecting platforms

Each integration has a guided wizard that asks only for what's needed and stores it in the **active workspace** (so each company can have its own sender, bot, etc.):

```bash
afax connect email      # Resend · SendGrid · SMTP
afax connect meta       # Facebook · Instagram · WhatsApp
afax connect telegram
afax connect slack
afax connect discord
afax connect leads      # Hunter.io
afax connect media      # image generation
afax connect deploy     # SSH/rsync target
```

Check status anytime:

```bash
afax connections
# ● connected / ○ not set per platform, + current live/dry-run state
```

All credentials can also come from environment variables (which never touch disk) — see the [variable reference](#/configuration).

## The connector catalogue

| Connector | Platforms | Used by | Guide |
| --- | --- | --- | --- |
| Email | Resend, SendGrid, raw SMTP (TLS 465) | `outreach --channel email` | [Email](#/email) |
| Meta | Facebook Pages, Instagram, WhatsApp Cloud | `marketing publish`, `outreach --channel whatsapp` | [Meta](#/meta) |
| Messaging | Telegram, Slack, Discord | `marketing publish`, `outreach --channel telegram` | [Messaging](#/messaging) |
| Leads | Hunter.io | `prospect source`, `prospect verify` | [Lead sourcing](#/leads) |
| Media | OpenAI-compatible images endpoint | `content image` | [Media](#/media) |
| Deploy | SSH + rsync | `deploy` | [Deploy](#/deploy) |

## Design notes

- **One choke-point.** All sends route through a single guarded dispatcher that checks `live && --live`, so a new connector can't accidentally bypass safety.
- **Per-workspace credentials.** An agency can wire each client's own email domain and bots; your LLM key stays global.
- **Secrets and export.** `afax export` redacts every credential by default — see [Export / import](#/export-import).
