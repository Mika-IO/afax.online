# Deploy to the cloud (Railway)

`afax web` is the same control panel you run locally, made deployable. Push it to
Railway (or any container host) and you get a hosted AFAX with a login-gated web
UI — chat, integrations, database and usage — reachable from anywhere, running
24/7. Read [Security](#/security) before exposing it.

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

   Railway injects `PORT` itself; `afax web` reads it and binds `0.0.0.0`
   automatically. You do **not** set `PORT`.

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

## Other hosts

Nothing here is Railway-specific. The same `Dockerfile` runs on Fly, Render, a
plain VPS (`docker run -e AFAX_WEB_TOKEN=… -e OPENAI_API_KEY=… -v afax:/data -p
8788:8788 afax`), or systemd with `AFAX_WEB_HOST=0.0.0.0`. Always put it behind
HTTPS and set a strong token — see [Security](#/security).
