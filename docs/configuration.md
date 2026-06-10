# Configuration

AFAX configuration is split into two layers that `afax config show` merges into one view:

| Layer | File | Holds |
| --- | --- | --- |
| **Global** | `~/.afax/config.json` | provider, LLM keys, autonomy, `live` flag, active workspace |
| **Per-workspace** | `~/.afax/workspaces/<slug>/config.json` | business profile, integration credentials |

Your LLM key is shared across all companies; everything business-specific is isolated per [workspace](#/workspaces).

## The `config` command

```bash
afax config show                          # current settings (keys masked)
afax config get providers.openai.model    # read any value by dotted path
afax config set autonomy execute          # write any value by dotted path
afax config path                          # where the global config lives
```

`config set` coerces values: `true`/`false` become booleans, numerics become numbers. Anything goes — the dotted path maps directly onto the JSON.

## LLM providers

AFAX ships three adapters behind one `chat()` interface. Switch any time with one command — no reinstall.

### Anthropic

```bash
export ANTHROPIC_API_KEY=sk-ant-...
afax config set provider anthropic
afax config set providers.anthropic.model claude-sonnet-4-6
```

Default model: `claude-sonnet-4-6`.

### OpenAI and OpenAI-compatible

Covers OpenAI, Groq, OpenRouter, Together, vLLM, LM Studio — anything speaking the `/v1/chat/completions` protocol.

```bash
export OPENAI_API_KEY=sk-...
afax config set provider openai
afax config set providers.openai.model gpt-4o-mini
# Point at any compatible endpoint (Groq shown):
afax config set providers.openai.baseUrl https://api.groq.com/openai/v1
```

Default model: `gpt-4o`, default baseUrl: `https://api.openai.com/v1`.

### Ollama (fully offline, no key)

```bash
ollama serve
afax config set provider ollama
afax config set providers.ollama.model llama3.1
```

Default baseUrl: `http://localhost:11434`. With Ollama, `hasLLM` is always true — no key required.

## Environment variables and `.env`

AFAX loads a `.env` file from the **current directory** at startup. Variables already set in the real environment always win and **never touch disk**.

```bash
# .env
OPENAI_API_KEY=sk-...
AFAX_PROVIDER=openai
AFAX_MODEL=gpt-4o-mini
```

> **Warning:** Never commit secrets. The repository's `.gitignore` excludes `.env` and `.env.*` by default. If a key leaks, rotate it at the provider immediately.

### Full variable reference

| Variable | Effect |
| --- | --- |
| `ANTHROPIC_API_KEY` | Anthropic key |
| `OPENAI_API_KEY` | OpenAI-compatible key (also reused for image generation if no media key is set) |
| `OPENAI_BASE_URL` | Override the OpenAI-compatible endpoint |
| `AFAX_PROVIDER` | Active provider: `anthropic` \| `openai` \| `ollama` |
| `AFAX_MODEL` | Model for the active provider |
| `AFAX_LIVE` | `1` or `true` → globally enable real outbound sending (gate 1) |
| `AFAX_WORKSPACE` | Force the active company workspace |
| `AFAX_HOME` | Override the data directory (default `~/.afax`) |
| `AFAX_DEBUG` | `1` → full stack traces on errors |
| `RESEND_API_KEY` / `SENDGRID_API_KEY` | Email driver key (sets the driver too) |
| `AFAX_EMAIL_FROM` | Verified sender address |
| `META_ACCESS_TOKEN` | Meta Graph token (FB / IG / WhatsApp) |
| `TELEGRAM_BOT_TOKEN` / `SLACK_WEBHOOK_URL` / `DISCORD_WEBHOOK_URL` | Messaging credentials |
| `HUNTER_API_KEY` | Hunter.io lead sourcing |

## Key precedence

For every credential, the order is:

1. **Environment variable** (including `.env` in the current directory) — never persisted.
2. **Config file** (`afax config set providers.anthropic.apiKey ...` or the `afax init` / `afax connect` wizards).

## Autonomy

```bash
afax config set autonomy suggest    # default: afax run proposes, you approve
afax config set autonomy execute    # afax run executes its own plan
```

## The `live` flag (safety gate 1)

```bash
afax config set live true     # allow real outbound actions globally
afax config set live false    # back to dry-run everything
```

This alone sends nothing — each command also needs its own `--live` flag (gate 2). See [Safety](#/integrations).
