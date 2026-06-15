# One-click integrations (OAuth)

Some services let a user **click "Connect", approve on the provider's screen, and
they're integrated** — no copy-paste. AFAX supports this for the providers that
actually offer an OAuth authorization flow: **Slack, Meta (FB/IG/WhatsApp) and
Discord**.

> Key-only services (Resend, OpenAI, Anthropic, Hunter, Telegram…) have **no
> OAuth** — the provider only issues API keys. For those, AFAX gives you
> smart-paste + a direct "Get key" link instead. That's not a limitation of
> AFAX; the OAuth screen simply doesn't exist for them.

## How it works

1. In the web panel → **Integrations**, OAuth-capable services show a
   **"Connect with …"** button (when the OAuth app is configured).
2. Clicking it sends the user to the provider's consent screen.
3. On approval the provider redirects back to
   `https://<your-host>/api/oauth/<provider>/callback`, AFAX exchanges the code
   for a token (CSRF-protected with a state cookie) and stores it in the right
   config slot. Done — no paste.

## One-time setup (operator)

OAuth needs an **app registered with each provider** (a `client_id` + `secret`).
The hosted **AFAX Cloud registers these once**, so it's genuinely one-click for
its users. Self-hosting? Register your own app per provider and set:

```bash
export AFAX_OAUTH_SLACK_CLIENT_ID=...      AFAX_OAUTH_SLACK_CLIENT_SECRET=...
export AFAX_OAUTH_META_CLIENT_ID=...       AFAX_OAUTH_META_CLIENT_SECRET=...
export AFAX_OAUTH_DISCORD_CLIENT_ID=...    AFAX_OAUTH_DISCORD_CLIENT_SECRET=...
```

When you register the app, set the **redirect URI** to exactly:

```
https://<your-host>/api/oauth/<provider>/callback
```

(e.g. `https://app.example.com/api/oauth/slack/callback`). Must be HTTPS in
production.

| Provider | Where to register the app | Stored as |
|----------|---------------------------|-----------|
| Slack | api.slack.com/apps → OAuth & Permissions (scopes: `incoming-webhook`, `chat:write`) | `integrations.slack.webhookUrl` + `botToken` |
| Meta | developers.facebook.com → your app → Facebook Login | `integrations.meta.accessToken` |
| Discord | discord.com/developers → OAuth2 (scope: `webhook.incoming`) | `integrations.discord.webhookUrl` |

If an OAuth app isn't configured, the service still works the old way — generate
a key/token and paste it (the panel falls back to fields automatically).
