# Deploy to the cloud (Railway)

This is the heart of AFAX: a **cloud instance of your company that keeps
producing even when your laptop is off**. Deploy once and you get an always-on
business you can talk to from anywhere — like Polsia, but open-source, custom and
efficient.

`afax cloud` runs three things in one process, on one port:

- **The control panel** — chat with your company, manage integrations, the
  database and usage (login-gated).
- **The inbound side** — webhooks (Telegram/WhatsApp/Stripe/email), AI
  auto-reply and asset hosting, so leads and payments land 24/7.
- **The autonomy heartbeat** — periodically runs due scheduled work, so the
  agents keep prospecting, posting and following up on their own.

(`afax web` is the panel alone; `afax serve` is the inbound side alone; `afax web
--serve` is the panel plus inbound on one port; `afax cloud` is all of that plus
the autonomy heartbeat — deploy this one.) Read [Security](#/security) before
exposing it.

## Logging in

Two ways to authenticate, both setting the same session cookie:

- **Token** — set `AFAX_WEB_TOKEN` (a long random secret); paste it on the login
  screen, or send it as the `x-afax-token` header for CLI/automation.
- **Username + password** — set `AFAX_WEB_USER` and `AFAX_WEB_PASS` (or pass
  `--user` / `--pass`). The login screen then shows username + password fields —
  handier for a human than copying a long token.

A public host requires at least one of these; AFAX refuses to bind otherwise.

## What you need

- This repo (Railway can deploy straight from GitHub).
- A provider key (e.g. `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`).
- A strong web token: `openssl rand -hex 24`.

The repo ships a `Dockerfile` and `railway.toml`, so Railway needs almost no
config.

## Steps

1. **New project → Deploy from GitHub repo** (or `railway up` from the CLI).
   Railway detects the `Dockerfile` and builds it. Zero dependencies, so the
   build is tiny.

2. **Add a Volume** mounted at **`/data`**. This is where all company state
   lives (config, JSON collections, memory). Without it, data resets on every
   redeploy. The image already sets `AFAX_HOME=/data`.

3. **Set variables** (Settings → Variables):

   | Variable | Value |
   |----------|-------|
   | `AFAX_WEB_TOKEN` | your `openssl rand -hex 24` secret — required to log in |
   | `OPENAI_API_KEY` | (or `ANTHROPIC_API_KEY`) your LLM key |
   | `AFAX_PROVIDER` | `openai` / `anthropic` / `ollama` (optional) |
   | `AFAX_CLOUD_INTERVAL` | autonomy heartbeat in minutes (default 10, optional) |

   Railway injects `PORT` itself; `afax cloud` reads it and binds `0.0.0.0`
   automatically. You do **not** set `PORT`. The image's start command is already
   `afax cloud`.

4. **Deploy.** The health check at `/healthz` turns green when it's up. Open the
   generated `*.up.railway.app` URL, enter your `AFAX_WEB_TOKEN`, and you're in.
   Railway terminates TLS, so the auth cookie is marked `Secure` automatically.

## First-run setup

The fresh instance has an empty workspace. From the panel:

- **Integrations** → set your provider/model and connect channels (email,
  Telegram, etc.). Secrets you type here stay on the server (never sent back to
  the browser).
- **Chat** → "ingest https://yourcompany.com" to learn your company, then start
  working.

Outbound stays **dry-run** until you flip `live` on in Integrations — keep it off
until you're ready to actually send.

## Make it autonomous

The heartbeat fires **due scheduled work** on its interval, so give the company a
routine to run. In Chat (or CLI) set schedules once:

```
schedule "every day at 09:00" --do "run --execute"
schedule "every day at 18:00" --do "marketing publish --platform telegram --topic 'daily update' --live"
```

Now the cloud instance prospects, posts and follows up on its own — you just drop
in to chat, review and steer. Webhooks (Telegram/WhatsApp/Stripe/email) hit the
same URL, so inbound leads and payments are handled 24/7 too.

## Other hosts

Nothing here is Railway-specific. The same `Dockerfile` runs on Fly, Render, a
plain VPS (`docker run -e AFAX_WEB_TOKEN=… -e OPENAI_API_KEY=… -v afax:/data -p
8788:8788 afax`), or systemd with `AFAX_WEB_HOST=0.0.0.0`. Always put it behind
HTTPS and set a strong token — see [Security](#/security).
