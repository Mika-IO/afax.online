# Changelog

All notable changes to AFAX are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] — 2026-06-20

Theme: **make the promises real, and never fake them.** A background worker now
turns tasks into prepared work; a human-approval queue replaces the dishonest
"dry-run"; synthetic leads are gone; marketing channels actually do something.

### Added
- **Deliverability layer.** A suppression list (opt-outs/bounces/complaints), a
  compliant unsubscribe footer on every cold email, a `GET /unsubscribe` one-click
  endpoint, a `POST /webhook/resend` handler that suppresses bounces/complaints,
  STOP-reply opt-out, a per-day send cap (`integrations.email.dailyCap`) and a
  throttle between batches (`integrations.email.minDelayMs`). Outreach and
  `approve --all` skip suppressed addresses. `afax suppress list|<email>`.
  (`src/deliverability.js`, `src/agents/outreach.js`, `src/approvals.js`,
  `src/integrations/email.js`, `src/server.js`)
- **Outreach that scales (template + merge, not one LLM call per email).** Outreach
  now writes ONE template per segment (a single LLM call — or zero with
  `--template`) and mail-merges it locally for every lead: `{{first_name}}`,
  `{{company}}`, `{{title}}`, `{{signal}}` + `{spintax|variation}`. N emails ≈ 1
  call instead of N. New flags: `--where` (segment), `--personalize` (one batched
  AI icebreaker for the whole run), `--template`/`--subject`. (`src/agents/outreach.js`)
- **Batch approve + batch send.** `afax approve --all` (and panel **Aprovar tudo**)
  sends every pending email through Resend's batch API (100 per HTTP call, 0 LLM
  calls), records a receipt per message, flips leads to `contacted`.
  (`src/approvals.js`, `src/integrations/email.js` `sendBatch`, `src/web.js`,
  `src/web.page.html`)
- **Background task worker.** `afax work` (and the `afax cloud` heartbeat) drains
  queued tasks: each task is a natural-language GOAL run through a new
  goal-driven orchestrator (`executeGoal`), which picks real commands and runs
  them. Read/prepare steps run for real; outbound steps are drafted for approval.
  (`src/worker.js`, `src/orchestrator.js`)
- **Approval queue.** `afax approvals` / `afax approve <id>` / `afax reject <id>`
  and panel **Aprovações** inbox + **Rodar fila** button. Approve does the REAL
  send, records the provider **receipt**, marks the lead `contacted` + CRM note —
  only then. Routes `GET /api/approvals`, `POST /api/approvals/:id/approve|reject`,
  `POST /api/work/run`. (`src/approvals.js`, `src/web.js`, `src/web.page.html`)
- **`afax data clean`** — one-shot hygiene that strips junk like `(unverified)`
  from stored emails so addresses are actually sendable. (`src/cli.js`)
- **Tasks & Approvals docs** (`docs/tasks.md`).

### Changed
- **Storage is now SQLite (built-in `node:sqlite`, still zero-dependency).** Each
  workspace gets a local `records.db`; inserts/updates/deletes are indexed and
  O(1)/O(log n) instead of rewriting a whole JSON file, and worker + chat can
  write concurrently (WAL + busy timeout). Existing `*.json` collections are
  migrated automatically on first open and kept as `*.json.bak` backups. The
  `store.js` API is unchanged, so callers didn't move. **Requires Node ≥ 22.5.**
  (`src/db.js`, `src/store.js`, `src/data.js`)
- **Prompt caching that actually hits.** System prompts are now built as
  static-first / dynamic-last blocks: the big stable part (identity, tool list,
  command catalog, rules, style) comes first and the per-call bits (snapshot,
  memory, connections) go last. The static block is marked cacheable, so
  Anthropic re-reads it at ~0.1x via `cache_control` and OpenAI's automatic
  prefix cache (~0.5x) kicks in too — instead of the previous layout where the
  dynamic content sat near the top and defeated caching entirely. `chat()` accepts
  `system` as `[{text,cache}]` blocks; all three adapters handle it. (`src/llm/index.js`,
  `src/llm/anthropic.js`, `src/llm/openai.js`, `src/llm/ollama.js`, `src/chat.js`,
  `src/agents/base.js`)
- **O(n) writes at scale.** Outreach and `approve --all` no longer rewrite a whole
  collection file per record (was O(n²) — at 56k leads each send rewrote the 1MB
  file). Records are accumulated and flushed once per collection via a new
  `addMany()`; lead-status flips and CRM notes are batched too. (`src/store.js`,
  `src/agents/outreach.js`, `src/approvals.js`)
- **No more fake sends.** The outbound choke-point (`registry.guarded`) no longer
  returns `{ok:true, dryRun:true}`. It's either a real send (`sent:true` + receipt)
  or `pending:true, sent:false` (prepared, NOT sent). Every caller (outreach,
  mailer, marketing publish, inbound auto-reply) reports honestly and never marks
  `delivered`/`contacted` without a receipt. (`src/integrations/registry.js`,
  `src/agents/outreach.js`, `src/agents/mailer.js`, `src/agents/marketing.js`,
  `src/server.js`)
- **Marketing channels are real.** Trimmed to the 8 channels AFAX actually runs
  (content, seo, email, outreach, partnerships, pr, build-in-public, ppc).
  `marketing channel <key> enable` now **schedules a real recurring action** via
  the scheduler instead of flipping a cosmetic flag; channels needing product-side
  mechanics (referral/affiliate/events/virality/…) were removed rather than faked.
  (`src/agents/marketing.js`)
- **Cheaper by default.** Agent WORK (drafting, prospect, orchestrator, the worker)
  runs on a cheaper model (`workModel()` → gpt-5-mini / claude-haiku); interactive
  chat keeps the full model. ~80% cost cut on background work. (`src/config.js`,
  `src/agents/base.js`, `src/orchestrator.js`)
- **Emails sanitized on write** (prospect/import/crm/mailer) so a recipient never
  carries `(unverified)` again — the root cause of the Resend 422s.
- Chat always answers after running tools (a guaranteed closing summary), and the
  Stop signal now threads into agent loops so a running batch stops mid-send.

### Removed
- **Synthetic lead generation.** `prospect --target` (LLM-invented leads),
  `templateLeads`, and the no-LLM "campaign stub" are gone. New leads come only
  from `prospect source <domain>` (Hunter) or `prospect import <file.csv>`.
  AFAX refuses to invent data. (`src/agents/prospect.js`, `src/agents/marketing.js`)

## [0.5.0] — 2026-06-17

### Added
- **X (Twitter) posting.** `marketing publish --platform x` now actually posts a
  tweet via API v2 (`src/integrations/x.js`), wired into the registry +
  `connections`. (Posting needs a user-context token with `tweet.write`; a
  read-only app bearer 403s, and the error says so.)
- **zernio (multi-platform social publishing).** Real integration with the zernio
  API (https://zernio.com/api/v1): `afax zernio accounts` lists connected social
  accounts, `afax zernio post --content "..." [--platform x] [--live]` publishes
  to one or all connected platforms at once. Exposed to the chat agent; live-gated;
  catalog test does a real `/accounts` check + smart-paste detects `sk_…` keys.
  (`src/integrations/zernio.js`)
- **MCP client.** Talk to any Model Context Protocol server over Streamable HTTP
  (JSON-RPC): `afax mcp tools` lists the server's tools, `afax mcp call <tool>
  --args '<json>'` invokes one. Exposed to the chat agent (call is
  approval-gated). The catalog test is now a real `tools/list` check, not a
  hard-coded OK. (`src/integrations/mcp.js`)
- **Generic agent data + web tools (agnostic enrichment).** The chat agent gained
  composable primitives so it can do arbitrary "pull a batch → inspect → mark"
  jobs over the REAL database instead of inventing leads: `data query <coll>
  --where f=v,f~sub,n>10 [--limit] [--fields]`, `data count`, `data get`,
  `data set <coll> <id> <field> <value>` (approval-gated), and `fetch <url>`
  (SSRF-guarded HTTP with status/redirect/title/text — works on the server, no
  browser). (`src/chat.js`, `src/integrations/web.js` fetchPage)
- **Ask / Plan / Agent modes.** A mode selector in the chat header: **Ask**
  answers only (no commands), **Plan** investigates with read-only tools and
  returns a numbered plan (no changes/sends), **Agent** executes. (`src/chat.js`,
  `src/web.js`, panel)
- **Database CRUD in the panel.** The Database view now creates, edits and
  deletes records inline — a **+ New** button and per-row Edit/✕ open a JSON
  editor modal (wired to the existing `POST/PUT/DELETE /api/data/:c[/:id]`).
- **Change the email sender by command.** `afax email from <addr>` (and
  `email set from <addr>`) sets `integrations.email.from` for the active
  workspace, so the chat agent can do it in natural language instead of saying
  it can't. (`src/agents/mailer.js`)
- **Delete a workspace from the panel.** `DELETE /api/workspaces/:slug`
  (refuses the active one; unlike the CLI it can remove `default`).
  (`src/web.js`, `src/workspace.js`)
- **Bulk data import.** `POST /api/data/:c/bulk` writes many records in one
  request (`mode` append|replace, ids/timestamps auto-filled, 48 MB body) — for
  migrating large scraped-lead CSVs without a call-per-record. (`src/web.js`)
- **Company output language.** A new `business.language` profile field makes the
  whole company speak one language across every output — chat, `outreach`,
  `email send`, content. It holds regardless of the incoming message's language
  (a lead writing in English to a PT-BR company still gets PT-BR), unless the CEO
  overrides. Resolution: explicit field → website-TLD guess → mirror the user.
  `context ingest` auto-detects and fills it in. (`src/style.js`, wired into
  `agents/base.js`, `chat.js`, `orchestrator.js`, `agents/context.js`, `init.js`)
- **Anti-filler output style.** Every agent prompt now bans simulated-thinking
  filler, preambles, sycophancy and padding to cut output tokens, latency and
  cost — without suppressing genuine reasoning. (`src/style.js`)
- **Files the agent can edit.** Chat gained write tools — `fs write`, `fs append`,
  `fs mkdir`, `fs mv`, `fs rm` — on top of the existing read tools. Writes are
  confined to the working-directory subtree. (`src/chat.js`)
- **Claude-style permission gate.** Every file write and every `--live` send asks
  first: an interactive `[y]es / [n]o / [a]ll` prompt in the terminal (with
  "approve all" for the session), and an off-by-default **Auto-approve** switch in
  the web panel chat header (`POST /api/chat/autoapprove`). `afax ask` denies
  writes/sends unless `--yes`.
- **Conversation history.** Chat sessions persist per workspace and survive
  restarts. The web panel gets a **History** menu (open, delete) and a **New chat**
  button. New module `src/conversations.js`; endpoints `GET /api/conversations`,
  `GET|DELETE /api/conversations/:id`. (`conversations` is now a collection.)
- **`afax email send`.** A direct, single-recipient email command
  (`--to --subject --body [--live]`, plus `email status`) that validates the
  address and uses it verbatim — so the chat agent stops repurposing `outreach`
  and never drifts to the wrong recipient. (`src/agents/mailer.js`)
- **Username + password login** for the web panel via `AFAX_WEB_USER` /
  `AFAX_WEB_PASS` (or `--user` / `--pass`), alongside the existing token auth. A
  public host now requires either. (`src/web.js`)
- **`afax web --serve`** mounts the inbound webhooks on the panel's port without
  the full `afax cloud` autonomy heartbeat.
- **Usage interaction history.** The Usage view now lists recent LLM calls
  (timestamp · provider · model · tokens · cost), and **Integrations** gained a
  **Test all connected** button (`POST /api/integrations/testall`).
- **Editable monthly budget in the panel.** The Usage view header now has a
  budget input that writes `budget.monthly` (0 = unlimited) — no more CLI-only.

### Fixed
- **`prospect` no longer silently pollutes real data.** Synthetic lead generation
  (`prospect --target`, which invents "(unverified)" leads) now requires approval,
  and the agent is told to use `data query` for existing leads and never use
  prospect to "segment/check" them. Real-data forms (`prospect source|verify|
  import`) stay unguarded. (`src/chat.js`)
- **Honest integration tests.** Test buttons no longer fake a pass: `mcp` runs a
  real `tools/list` and `zernio` a real `/accounts` check (both were hard-coded
  "ok"). `slack`/`discord` still note their send is webhook-format-only.
- **Literal `\n` in sent emails.** The chat agent passes the body with backslash
  escapes (it's a string inside a command inside JSON); `email send` now unescapes
  `\n`/`\t`/`\r` so messages arrive with real line breaks. (`src/agents/mailer.js`)
- **Approval UX.** A denied command card in the web chat now shows an
  **"✓ Aprovar e reenviar"** button — turns on Auto-approve for the session and
  re-sends the last message, instead of leaving the user to hunt for the toggle.
- **Railway build.** Removed the Docker `VOLUME ["/data"]` instruction the
  Dockerfile carried — Railway's builder rejects it. Persistence now relies on a
  Railway Volume mounted at `/data` (`AFAX_HOME=/data` unchanged).
- **Stop now actually stops.** Pressing Stop in the web chat aborts between
  commands instead of letting the model keep reasoning/executing in the
  background. (`src/chat.js`)
- **Clearer Resend errors.** A 422 from Resend is rewritten to name the usual
  cause (unverified sending domain, or a test-mode account that can only mail its
  own verified address). Recipient addresses are validated before any send.
  (`src/integrations/email.js`)

## [0.4.0] — 2026-06-15

### Added
- **Redesigned control panel.** The web app was rebuilt to the product's
  end-state design — a warm dark theme, command-card chat, a Tasks board with
  automations + live activity, a Content gallery, grouped Integrations, and a
  Database with Leads (search + pagination), a Pipeline kanban and Contacts,
  plus a Usage view with per-day and per-model charts. Wired to the real APIs
  (no mock data); served as a static `src/web.page.html`.
- **See your generated assets.** The CLI now prints a clickable link to the
  output folder and each file after `content carousel|meme|poster|reel|image`.
  The web panel gets a **Content** tab that previews everything inline — image
  grids, playable reels, and copy — served from a path-contained `/api/asset`
  (auth-gated, AFAX_HOME-jailed) with a `/api/content` listing.
- **Task board (Polsia-style).** A shared work board the CEO and agents both use:
  `afax task add|list|start|done|reopen|rm` and a **Tasks** tab in the web panel
  (todo → doing → done, click the dot to advance). The chat agent tracks
  multi-step work on it so progress is visible. (`src/agents/task.js`)
- **Company management in the web panel.** A workspace switcher in the sidebar —
  pick a company or create a new one (isolated profile/data) without the CLI.
  New endpoints: `GET/POST /api/workspaces`, `POST /api/workspaces/use`.
- **One-click OAuth** for the services that offer it — **Slack, Meta, Discord**.
  "Connect with …" → provider consent screen → callback exchanges the code and
  stores the token (CSRF-protected), no paste. Gated on an OAuth app per provider
  (Cloud hosts them; self-host sets `AFAX_OAUTH_<P>_CLIENT_ID/SECRET`). Key-only
  services (Resend/OpenAI/…) have no OAuth and keep smart-paste. See
  [docs/oauth.md](docs/oauth.md). (`src/integrations/oauth.js`)
- **Frictionless integrations.** A catalog (`src/integrations/catalog.js`) of
  minimal-field setups with "where to get the key" links, credential
  auto-detection and a live connection test. `afax connect paste "<key>"`
  detects the service from a pasted value, saves it and tests it;
  `afax connect test` verifies connections. The web Integrations tab gets a
  smart-paste box + per-service cards (only the fields that matter — no SMTP
  host/port for Resend) with Save/Test/Get-key. The chat agent can self-configure
  via `connect paste`/`connect test`.
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
