# Changelog

All notable changes to AFAX are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] — 2026-06-15

### Added
- **Premium media generation.** `afax content carousel|meme|poster|reel` renders
  on-brand HTML/CSS through headless Chromium to PNG (carousel slides, memes,
  posters) and MP4 (motion reels: animated HTML → Playwright video → ffmpeg, with
  optional music or AI voiceover). The brand derives from the workspace profile;
  the model drafts the spec from a `--topic`, or pass `--spec file.json`. Output
  is auto-organized under `~/.afax/library/<brand>/<type>/<date>_<slug>/` with a
  caption. Playwright + ffmpeg are optional/lazy. (`src/content/*`)
- **Browser capability (Hermes-style).** `afax browser <url>` and agent tools
  (`browser open/read/click/type/enter/scroll/shot/close`) drive a real headless
  browser via an optional, lazy-imported Playwright — the core stays zero-dep,
  and a DOM snapshot returns the page text plus numbered interactive elements for
  an act→observe loop. `renderHtmlToPng` lays the groundwork for premium media.
  (`src/integrations/browser.js`)
- **Self-critique vs Hermes / Claude Code** with applied fixes — the agent now
  self-corrects on fixable command errors and verifies results before claiming
  done. See [docs/comparison.md](docs/comparison.md).
- **Deployable Cloud (`afax web` on Railway/any container).** `Dockerfile` +
  `railway.toml`; binds `0.0.0.0` and reads `PORT` automatically, persists to a
  `/data` volume (`AFAX_HOME`), `/healthz` for platform health checks. See
  [docs/cloud.md](docs/cloud.md).

### Security
- **Real auth for the web panel.** Refuses to bind a public host without
  `AFAX_WEB_TOKEN`; token now travels as an **HttpOnly, SameSite=Strict** cookie
  (login form) or `x-afax-token` header — never in the URL; constant-time
  comparison; failed-login throttle; CSP + `X-Frame-Options`/`nosniff`/
  `Referrer-Policy` on every response.
- **SSRF guard** on `context ingest` — blocks loopback/private/link-local and
  cloud-metadata (`169.254.169.254`) targets and won't follow redirects.
- **No secret read-back** — `config get` masks `key/secret/token/pass` values, so
  the chat agent can't be tricked into printing your keys.
- **Prototype-pollution guard** on `config set` paths.
- Full critical review in [docs/security.md](docs/security.md).

## [0.3.0] — 2026-06-15

### Added
- **`afax web` — local control panel.** A zero-dependency single-page app over a
  small JSON API: chat with the company (token-streamed, same engine/tools/budget
  as the CLI), configure providers & integrations (secrets masked, never sent
  back to the browser), browse/add/delete database records across all
  collections, and watch usage + set the budget. Binds to `127.0.0.1` and
  requires a per-session token on every API call — it holds your keys and spends
  money, so it is local-only by default (`--host` to override).
  Polished sidebar UI with crisp inline-SVG icons, markdown-rendered assistant
  replies (bold/code/code-blocks/links) with copy buttons, an auto-resizing
  composer (Enter sends, Shift+Enter newline), skeleton loaders and empty states,
  paginated + searchable database tables (newest-first, 25/page), dirty-field
  highlighting and friendly section names in Integrations, and a remembered
  active tab. Performance: token streaming is batched through
  requestAnimationFrame (no per-token reflow), markdown is rendered once on
  completion, autoscroll only engages near the bottom, and CSS `contain` limits
  layout work. (`src/web.js`, `src/web.page.js`)
- **Streaming chat** — the assistant's reply now renders token-by-token as the
  model writes it, instead of appearing only when fully done. SSE/NDJSON streaming
  across all three providers (Anthropic, OpenAI-compatible, Ollama).
  (`src/llm/stream.js`)
- **Thinking spinner** — a loading indicator shows while waiting for the first
  token, then erases itself, making the session feel live.
- **Agentic filesystem tools** — the chat agent can now inspect the local disk
  read-only (`fs ls`, `fs tree`, `fs read`, `fs find`) so it explores what the
  CEO points at (a leads folder, a CSV, a repo), understands the structure, and
  plans the work itself instead of asking for a description. (`src/chat.js`)
- **Redesigned chat welcome** — the ASCII wordmark, a live status line
  (company · provider/model · live/dry-run), and a brief "what I can do" guide.
  Tagline is now **"Your company on autopilot."** (`src/chat.js`, shared
  `banner()` in `src/logger.js`)
- **Auto-learn company on setup** — `afax init` now offers to ingest your
  website right after setup, so every agent starts with real company context
  instead of an empty profile. (`src/init.js`)
- **Usage metering & budget control** — every LLM call is metered (tokens +
  estimated USD) and recorded to a per-workspace ledger. The chat shows a live
  cost meter after each reply and a session total on exit; `afax usage [--recent]`
  reports monthly/all-time spend with a budget bar. Set a cap with
  `afax config set budget.monthly <usd>` (0 = unlimited) — calls are refused once
  the cap is hit. (`src/usage.js`, `src/llm/pricing.js`)
- **`afax self-update`** — reinstall the CLI globally from the local source for
  fast dev iteration (`npm install -g .`); `--link` uses `npm link`.
  (`src/selfupdate.js`)

### Fixed
- **Reasoning models (gpt-5, o-series) now work.** They spend the token budget
  thinking before emitting visible text, so the old 1.2k cap came back empty.
  We now give them 8k+ headroom and `reasoning_effort: low`, which also makes
  streamed tokens appear quickly. (`src/llm/openai.js`)
- **"Empty model response" no longer eats the user's turn.** When the model
  returns empty or unparseable JSON, the chat now degrades gracefully — reusing
  any already-streamed text or retrying in plain-text mode — so a reply always
  appears. (`src/chat.js`)

## [0.2.0] — 2026-06-15

### Added
- Natural-language chat interface — plain `afax` drops into a conversational
  session that runs real AFAX commands under the hood; `afax ask "…"` is the
  one-shot scriptable form.
- Inbound `afax serve` server for webhooks, auto-reply, and asset hosting.
- `afax inbox` to view inbound messages.

## [0.1.0]

### Added
- Initial CLI: 8 agents (Prospect, Outreach, Marketing, Sales, Content, CRM,
  Automation, Finance) and an orchestrator, over local JSON in `~/.afax`.
- Multi-workspace isolation, persistent memory, scheduler, deploy.
- Provider config (Anthropic / OpenAI-compatible / Ollama), dry-run/live gates.
- Docs site and guides.

[0.3.0]: https://afax.online
[0.2.0]: https://afax.online
[0.1.0]: https://afax.online
