# AFAX vs Hermes vs Claude Code — an honest self-critique

Where AFAX stands against a coding agent (Claude Code) and a computer-use agent
(Hermes), what it's missing, and what changed because of this review. Written to
be critical, not flattering.

## What AFAX is good at

- **Domain-shaped.** Eight business agents + an orchestrator over real data and
  connectors — Claude Code/Hermes are general; AFAX ships the company.
- **Zero-dependency, local-first, deployable.** No supply chain; JSON you can
  `cat`; one Dockerfile to the cloud.
- **Hard safety rail.** Outbound is double-gated through one choke-point; budget
  metering refuses runaway spend. Most agent frameworks have neither.

## Honest gaps (vs Claude Code)

| Gap | Claude Code | AFAX today | Status |
|-----|-------------|------------|--------|
| **File editing** | Edits/patches files | `fs` is **read-only** | Deliberate boundary (see below) |
| **Native tool-calling** | Structured function calls | Hand-rolled `{say,run}` JSON | Works; tolerant parser + fallback. Tech debt. |
| **Context compaction** | Summarizes/compacts long sessions | Naive last-N window | Open — long sessions lose early context |
| **Sub-agents / task lists** | Parallel agents, todos | Single linear loop | Open |
| **Self-correction on error** | Retries with fixes | Fed output back, hoped for the best | **Improved** — now told to fix & retry |
| **Verification** | Checks its work | Often claimed done unverified | **Improved** — now told to verify with a read |
| **Per-tool permissions** | Asks before risky tools | Only the `live` gate | Open (the `live` gate covers the costly case) |

## Honest gaps (vs Hermes)

| Gap | Hermes | AFAX today | Status |
|-----|--------|------------|--------|
| **Browser / computer use** | Drives a browser | None | **Closed** — real headless browser tools added |
| **Vision** | Understands screenshots | Browser returns **DOM text**, not pixels | Open — could send screenshots to a vision model |
| **Long-horizon planning** | Multi-step autonomy | Orchestrator is template-driven | Partial |

## What changed in this review

1. **Browser capability (the headline).** `src/integrations/browser.js` — an
   optional Playwright-backed headless browser the agent drives Hermes-style:
   `browser open → read numbered elements → click/type → read again`. Exposed as
   agent tools and `afax browser <url>`. DOM-based (not vision) so it's fast and
   token-cheap. Lazy-imported, so the core stays zero-dependency; if Playwright
   isn't installed the agent says so instead of crashing.
2. **Self-correction + verification** baked into the agent's rules (above).
3. Earlier in the cycle: honesty about missing integrations, no-filler rule,
   live connection awareness, budget metering, SSRF guard, secret masking.

## Deliberate boundaries (not bugs)

- **`fs` is read-only.** AFAX operates a business; it should not silently rewrite
  arbitrary files on a server that may be remote and multi-channel. Code-editing
  is Claude Code's job. A guarded, AFAX_HOME-scoped write tool could be added if a
  concrete need appears.
- **DOM over vision.** Cheaper and deterministic; vision is a future add for
  pixel-only sites.

## Next, in priority order

1. **Context compaction** — summarize old turns into memory when the window
   fills, so long autonomous runs don't degrade.
2. **Premium media generation** — port the HTML→Chromium→PNG/MP4 pipeline
   (carousels, memes, motion reels with TTS) into a first-class `content` /
   `media` capability. The browser engine already renders HTML→PNG
   (`renderHtmlToPng`); video needs frames→ffmpeg + a TTS backend.
3. **Vision browsing** — optional screenshot → vision-model step for sites the
   DOM snapshot can't describe.
4. **Native tool-calling** — migrate `{say,run}` to provider tool-calls to drop
   the custom JSON contract.
