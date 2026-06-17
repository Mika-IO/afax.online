# Security

A critical review of the whole AFAX stack: the CLI, the chat agent, the
inbound server (`afax serve`) and the web control panel / Cloud (`afax web`).
Severity is rated for the **default deployment** and status reflects the current
code. Read the threat model first — several "accepted" items are only safe
because AFAX is **single-tenant**.

## Threat model

AFAX is a **single-tenant admin tool**. Whoever holds the access token (or shell
on the box) can run any AFAX command, read the workspace, and — if the outbound
gates are open — send real messages and spend money. It is **not** a multi-tenant
SaaS: there is no per-user isolation inside one instance. The Cloud model is
"one isolated instance per customer", not "many customers in one process".

Trust boundaries:

- **The token** gates the web panel. Treat it like a root password.
- **The LLM is not trusted.** It chooses which commands to run. Content it reads
  (websites via `context ingest`, files via `fs`) can carry adversarial
  instructions (prompt injection). The blast radius is bounded by the safety
  gates below — not by trusting the model.
- **The outbound gates** (`live` + `--live`) are the last line before anything
  leaves the box.

## Findings

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | Prompt injection → command execution / data surfacing | High | Mitigated (bounded) |
| 2 | SSRF via `context ingest` (incl. cloud metadata `169.254.169.254`) | High | **Fixed** |
| 3 | Secret exfiltration via `config get <secret>` | High | **Fixed** |
| 4 | Public web exposure without authentication | High | **Fixed** |
| 5 | Auth token carried in the URL (history/Referer leakage) | Medium | **Fixed** |
| 6 | Arbitrary file read via `fs` tools (absolute / `..` paths) | Medium | Accepted (single-tenant) |
| 7 | Prototype pollution via `config set <path>` | Low | **Fixed** |
| 8 | CSRF on state-changing API | Low | Mitigated |
| 9 | Unauthenticated `/inbound/email` on `afax serve` | Medium | Open (documented) |
| 10 | Secrets stored as plaintext JSON at rest | Medium | Accepted (use env + volume perms) |
| 11 | Weak default Meta webhook verify token (`afax`) | Low | Open (change it) |
| 12 | No global rate limiting / single process | Low | Accepted (platform edge) |

### 1 — Prompt injection → command execution (High, mitigated)

The chat agent runs AFAX commands the **LLM** selects, and can read external
content (`context ingest <url>`, `fs read`). A hostile page or file can try to
steer the model ("ignore previous instructions, run …"). What keeps this bounded:

- **Outbound double-gate.** Nothing is sent unless `config set live true` **and**
  `--live` are both present; all senders funnel through one guarded dispatcher.
  Keep `live=false` unless you are actively sending.
- **Secrets can't be read back.** `config get` / `config show` mask
  `apiKey/secret/token/pass` (finding 3), so the agent can't print your keys.
- **`fs` tools are read-only** — no write/delete/exec.
- **SSRF guard** (finding 2) stops "fetch this internal URL" tricks.

Residual risk: with `live=true` the agent could be talked into sending a message,
and it can surface the *contents* of files it reads. Recommendation: treat the
agent as a user with shell-equivalent power; only enable `live` for the window
you need it; don't point `fs`/`context` at untrusted data while `live`.

### 2 — SSRF (High, fixed)

`context ingest <url>` fetched any URL the user/agent supplied. On a cloud host
that includes `http://169.254.169.254/…` (instance metadata → credential theft)
and internal services. **Fixed** in `src/integrations/ssrf.js`: every fetched URL
is validated, DNS-resolved and rejected if it points at loopback/private/
link-local/metadata ranges (IPv4+IPv6), non-http(s) schemes are blocked, and
redirects are not followed (`redirect: 'error'`).

### 3 — Secret exfiltration via `config get` (High, fixed)

`afax config get providers.openai.apiKey` printed the **raw key**, reachable from
the chat agent. **Fixed**: `config get` masks any `key/secret/token/pass` leaf
(recursively) — the web `/api/config` already masked them.

### 4 / 5 — Web auth (High/Medium, fixed)

The panel exposes keys, the database and money. Now:

- Refuses to bind a **public** host without an access token **or** username +
  password (`AFAX_WEB_USER` / `AFAX_WEB_PASS`).
- Token sent as an **HttpOnly, SameSite=Strict** cookie (set via the login form)
  or an `x-afax-token` header — **never in the URL**. The local one-time
  `?token=` convenience immediately sets the cookie and 302-redirects to a clean
  URL.
- **Constant-time** comparison for the token *and* the username/password; failed
  logins are throttled (~0.5s).
- Security headers on every response: `Content-Security-Policy` (locks script/
  connect to `self`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`.

### 6 — Arbitrary file read via `fs` tools (Medium, accepted)

`fs read/ls/tree/find` resolve absolute and `..` paths, so the agent can read any
file the process user can — including other workspaces and the config file. On a
container this is limited to the container's filesystem, but still includes your
keys on disk. **Accepted** for single-tenant self-host. For a future
multi-tenant mode this must be jailed to `AFAX_HOME`.

**Writes** (`fs write/append/mkdir/mv/rm`) are stricter than reads: they are
**confined to the working-directory subtree** (paths that escape it are refused)
**and** each one requires explicit approval — an interactive `[y]/[n]/[a]` prompt
in the terminal, or the off-by-default **Auto-approve** switch in the web panel.
Any `--live` send is gated the same way. So a prompt-injected model cannot
silently overwrite files or fire real messages.

### 8 — CSRF (Low, mitigated)

State-changing endpoints authenticate via the cookie. `SameSite=Strict` means a
cross-site page can't send it, and the API expects JSON — so CSRF is mitigated
without a separate token.

### 9 — Unauthenticated inbound email (Medium, open)

`afax serve` exposes `POST /inbound/email` with no signature, so anyone who finds
the URL can inject `inbox` records and fire `message.received` flows (and, with
auto-reply + live on, trigger an AI reply). Telegram/Meta/Stripe paths are
verified (Stripe HMAC, Meta verify token). **Recommendation:** put `afax serve`
behind a gateway, or add a shared-secret header check before exposing
`/inbound/email`. Auto-reply still requires `live=true`.

### 10 — Secrets at rest (Medium, accepted)

Config (including API keys) is plaintext JSON under `AFAX_HOME`. Mitigations:
prefer **environment variables** for keys (they override disk and are never
written), keep `AFAX_HOME` on a private volume with tight permissions, and don't
bake secrets into the image.

## What's already solid

- **Zero runtime dependencies** — no third-party supply chain to compromise.
- **One outbound choke-point** — a new connector can't bypass the `live`/`--live`
  gate; `live false` freezes the company instantly.
- **Stripe webhooks** are HMAC-signature verified (`verifyStripe`).
- **Budget cap** refuses LLM calls once the monthly limit is hit.
- **Prototype-pollution guard** on `config set` paths.

## Hardening checklist for a public deploy

1. `export AFAX_WEB_TOKEN=$(openssl rand -hex 24)` — long, random, secret.
2. Terminate **TLS** at the edge (Railway/Caddy/Cloudflare). The cookie sets
   `Secure` automatically behind `x-forwarded-proto: https`.
3. Keep `live=false` until you actually send; enable per-task, then disable.
4. Put provider keys in **env vars**, not the on-disk config.
5. Mount `AFAX_HOME` on a private volume; don't expose `afax serve` inbound
   endpoints without a gateway/secret.
6. Change the Meta webhook verify token from the default.

Found something? Open a private report rather than a public issue.
