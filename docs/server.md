# 🌐 Server — inbound, auto-reply & asset hosting

`afax serve` is the inbound half of the company: one zero-dependency HTTP server that receives replies from the world, hosts your generated images publicly, and confirms payments. Pair it with the [scheduler](#/scheduler) cron line and the loop is closed: AFAX speaks **and** listens, 24/7.

```bash
afax serve                # default port 8787
afax serve --port 9000
```

## Routes

| Route | What it does |
| --- | --- |
| `GET /health` | liveness probe |
| `GET /assets/<file>` | serves `~/.afax/assets` publicly (images → Instagram) |
| `GET /webhook/meta` | Meta webhook verification handshake (`hub.challenge`) |
| `POST /webhook/meta` | inbound **WhatsApp** messages |
| `POST /webhook/telegram` | inbound **Telegram** messages |
| `POST /webhook/stripe` | **payments** → invoice paid + revenue booked |
| `POST /inbound/email` | inbound **email** as JSON `{from, subject, text}` |

## Configuration

```bash
afax connect server
# port:        8787
# publicUrl:   https://afax.yourdomain.com     (how the world reaches this server)
# autoreply:   true|false                       (AI answers inbound messages)
# verifyToken: afax                             (Meta webhook handshake)
```

`publicUrl` can also come from the `AFAX_PUBLIC_URL` env var. Put the server behind your reverse proxy (Caddy/Nginx) for TLS.

## The inbound pipeline

Every message that arrives:

1. is stored in the **inbox** (`afax inbox` to read it),
2. logs a **CRM note** when the sender matches a contact (by email or phone),
3. emits the **`message.received` event** — any flow with a matching trigger runs ([Automation](#/automation)),
4. optionally gets an **AI auto-reply** in your brand voice through the same channel.

Auto-reply requires **both**: `integrations.server.autoreply = true` **and** the global `live` flag — the same safety philosophy as everywhere else. With autoreply off, messages just land in the inbox and trigger flows.

```bash
afax config set integrations.server.autoreply true
afax config set live true
```

## Wiring each platform

**Telegram** — point your bot's webhook at the server:

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://your-host/webhook/telegram"
```

**WhatsApp (Meta)** — in your Meta app's WhatsApp config, set the callback URL to `https://your-host/webhook/meta` and the verify token to your `verifyToken`. Subscribe to `messages`.

**Email** — point any inbound-parse service (e.g. SendGrid Inbound Parse, a Cloudflare Email Worker, or your own MTA hook) at `POST /inbound/email` with JSON `{from, subject, text}`.

**Stripe** — add an endpoint in the Stripe dashboard → `https://your-host/webhook/stripe`, subscribe to `checkout.session.completed` / `invoice.paid`, and store the signing secret:

```bash
afax config set integrations.stripe.webhookSecret whsec_...
```

> **Warning:** With `webhookSecret` set, signatures are verified (HMAC-SHA256, timing-safe). Without it the endpoint accepts unsigned posts — fine for local testing, set the secret in production.

## Asset hosting → Instagram

`afax content image` saves PNGs to `~/.afax/assets`. With the server running and `publicUrl` set, every generated image gets a public URL automatically, and `marketing publish --platform instagram --image <local path>` hosts the file transparently:

```bash
afax content image --prompt "launch hero, orange on black"
# ✔ Saved → ~/.afax/assets/img-x1.png
# › Public URL: https://afax.yourdomain.com/assets/img-x1.png

afax marketing publish --platform instagram --topic "launch" \
  --image ~/.afax/assets/img-x1.png --live        # hosted + published
```

## Running 24/7

Under systemd on your VPS (full guide: [VPS](#/vps)):

```text
# /etc/systemd/system/afax-serve.service
[Unit]
Description=AFAX inbound server
After=network.target

[Service]
User=afax
EnvironmentFile=/home/afax/.afax-env
ExecStart=/usr/bin/afax serve
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now afax-serve
afax inbox        # see what came in
```
