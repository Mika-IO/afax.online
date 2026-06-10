# Installation

## Requirements

- **Node.js ≥ 18** — AFAX uses the native `fetch` API. Check with `node -v`.
- **git** — to clone the repository.
- Optional, for full power:
  - An LLM API key (Anthropic or any OpenAI-compatible provider), **or** a local [Ollama](https://ollama.com) install (no key needed).
  - Platform credentials for sending (email, Meta, Telegram…). Add them only when you need them — see [Integrations](#/integrations).
  - `ssh` + `rsync` if you want `afax deploy`.

## Install globally

```bash
git clone https://github.com/mika-io/afax.online.git
cd afax.online
npm install -g .        # creates the `afax` command

afax version            # → afax v0.1.0
afax help               # full command list
```

> **Note:** Zero runtime dependencies. `npm install -g .` only links the package — there is nothing to download or compile, and no `node_modules` is created.

## Run without installing

```bash
node bin/afax.js help
node bin/afax.js status
```

Every example in these docs that says `afax <cmd>` works identically as `node bin/afax.js <cmd>`.

## First-time setup

```bash
afax init
```

The interactive wizard takes ~60 seconds and asks for:

1. **LLM provider** — `anthropic`, `openai` (also covers Groq / OpenRouter / vLLM / LM Studio) or `ollama` (offline).
2. **API key** — or leave blank to use an environment variable instead of storing the key on disk.
3. **Business profile** — company name, what you sell, ideal customer (ICP), brand tone, website. This profile is injected into every agent's prompt.
4. **Autonomy** — `suggest` (AFAX proposes, you approve) or `execute` (AFAX acts on its own).

You can re-run `afax init` at any time, or change individual values with [`afax config set`](#/configuration).

## Verify the install

```bash
afax status        # dashboard across all 7 modules
afax config show   # active provider, model, autonomy, LLM online/offline
```

If `LLM` shows `○ offline`, commands still work with templated output — add a key to unlock real intelligence. See [Configuration](#/configuration).

## Updating

```bash
cd afax.online
git pull
npm install -g .   # re-link (instant — no dependencies)
```

## Uninstalling

```bash
npm uninstall -g afax
rm -rf ~/.afax          # ⚠ deletes all company data — export first (afax export)
```
