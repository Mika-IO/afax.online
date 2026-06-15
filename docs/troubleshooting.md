# Troubleshooting & FAQ

## First reflexes

```bash
AFAX_DEBUG=1 afax <command>     # full stack trace instead of the short error
afax config show                # provider, model, key state, LLM online?
afax connections                # which platforms are wired + live state
afax config path                # where the data actually lives
```

## LLM problems

| Symptom | Cause / fix |
| --- | --- |
| `No LLM configured` | Run `afax init`, or export `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`, or switch to `ollama` |
| 401 from the provider | Wrong/rotated key. Env beats config — check `echo $OPENAI_API_KEY` isn't stale |
| `Model did not return parseable JSON` | Weak model for structured output. Try a stronger one (`afax config set providers.openai.model gpt-4o`), or simply re-run |
| Cannot reach Ollama | `ollama serve` running? Check `providers.ollama.baseUrl` (default `http://localhost:11434`) |
| Wrong model being used | `AFAX_MODEL` / `AFAX_PROVIDER` env vars override config silently — unset them |
| `'max_tokens' is not supported` | Fixed in v0.2 — AFAX retries with `max_completion_tokens` automatically; update AFAX |
| `afax` opens help instead of chat | Chat needs an LLM **and** a TTY; in scripts/cron use explicit commands or `afax ask` |
| Webhook arrives but nothing happens | Is `afax serve` running? Check `afax inbox`; auto-reply also needs `autoreply=true` + global `live` |

## "It didn't send anything"

That's the design. Outbound needs **both** gates:

```bash
afax config set live true            # gate 1
afax outreach --channel email --live # gate 2
```

Check the header line of the command output — it states `dry-run`, `LIVE`, or the tell-tale `LIVE flag but config.live=false → dry-run`.

## Outreach

| Symptom | Fix |
| --- | --- |
| `No leads to contact` | All leads are `contacted` or none exist. `afax prospect …` first, or target by status: `--status new` |
| Outreach refuses without LLM | Intentional — no templated cold messages. `afax init` |
| Sent but lead not marked contacted | Only **real** (live, successful) sends mark leads — dry-runs never do |

## Integrations

| Symptom | Fix |
| --- | --- |
| Email 4xx | Domain not verified at Resend/SendGrid, or `from` mismatch. See [Email](#/email) |
| SMTP timeout | AFAX uses implicit TLS on 465; providers that only do STARTTLS/587 won't work yet |
| Instagram publish fails | Needs a **public** image URL, an IG **Business** account, and `instagram_content_publish`. See [Meta](#/meta) |
| Telegram `chat not found` | Bot isn't in that chat, or `chatId` wrong — re-check via `getUpdates` |
| Hunter empty results | Domain has no public emails, or free-tier quota exhausted |
| `rsync failed (is it installed?)` | Install `rsync`/`ssh` locally; see [Deploy](#/deploy) |

## Scheduler

| Symptom | Fix |
| --- | --- |
| Task never runs | Something must call `afax schedule run` — typically cron. See [VPS](#/vps) |
| Runs late | Tasks execute on the next cron tick after due; tighten `*/15` if needed |
| `Next run` looks shifted | The list shows UTC; "at 09:00" aligns to the **server's** local time |
| Task ran once and stopped | Its `when` didn't parse as an interval → one-shot. Use the supported forms in [Scheduler](#/scheduler) |

## Data & workspaces

| Symptom | Fix |
| --- | --- |
| Commands hit the wrong company | Check `afax workspace current`; `AFAX_WORKSPACE` env overrides everything |
| Created workspace but data went to default | `workspace create` doesn't switch — run `workspace use` |
| Imported company has no keys | Exports redact secrets by default. Reconnect (`afax connect …`) or re-export with `--with-secrets` |
| Want a clean slate | `afax workspace create sandbox && afax workspace use sandbox` — or `rm -rf ~/.afax` (destroys everything) |

## FAQ

**Does my data go anywhere?** Only to the API endpoints you configure (your LLM provider, and any platform you connect). State stays in `~/.afax/` as plain JSON.

**Can I run it fully offline?** Yes — provider `ollama` needs no key and no internet. Connectors obviously need network to send.

**Is it free?** Yes — the software is 100% open source under the [MIT license](https://github.com/mika-io/afax.online/blob/main/LICENSE); you only pay your own LLM/API usage. Prefer managed hosting? See [AFAX Cloud](https://afax.online/#pricing).

**Where do I report bugs?** [GitHub issues](https://github.com/mika-io/afax.online/issues). Include the `AFAX_DEBUG=1` output.
