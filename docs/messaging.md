# Integration — Telegram / Slack / Discord

Three lightweight connectors for publishing and (Telegram) direct messages. All real HTTP, zero dependencies.

## Telegram

1. Talk to [@BotFather](https://t.me/BotFather), create a bot, copy the **bot token**.
2. Get a **chat id**: add the bot to a channel/group (or DM it), then read the id from `https://api.telegram.org/bot<TOKEN>/getUpdates`.

```bash
afax connect telegram          # botToken + default chatId
# or: export TELEGRAM_BOT_TOKEN=123:abc

afax marketing publish --platform telegram --message "ship log" --live
afax outreach --channel telegram --live      # per-lead chat ids
```

Messages are sent with Markdown parse mode. The default `chatId` is used for publishing; outreach uses each lead's stored id.

## Slack

Easiest path: an **Incoming Webhook**.

1. In Slack: *Apps → Incoming Webhooks → Add to Slack*, pick a channel, copy the URL.

```bash
afax connect slack             # paste webhookUrl
# or: export SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

afax marketing publish --platform slack --message "Deploy done ✅" --live
```

A bot token (`xoxb-…`) also works — AFAX then calls `chat.postMessage` (set `integrations.slack.botToken`, optional `channel`, default `#general`).

## Discord

1. Server Settings → *Integrations → Webhooks → New Webhook*, pick a channel, copy the URL.

```bash
afax connect discord           # paste webhookUrl
# or: export DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...

afax marketing publish --platform discord --message "ship log week 3" --live
```

## Use as a 24/7 report channel

A favorite pattern: AFAX runs autonomously on a [VPS](#/vps) and reports to you on Telegram/Discord:

```bash
afax schedule "every day at 18:00" \
  --do "marketing publish --platform telegram --topic 'daily company status report' --live"
```

Remember both [safety gates](#/integrations): global `live` **and** `--live` in the command.
