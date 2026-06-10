# Company context & memory

Context is what makes every agent sound like **your** company instead of a generic bot. It has two parts: the **business profile** (structured fields) and **persistent memory** (accumulated facts).

## The business profile

Five fields, injected into every agent's system prompt:

| Field | Example |
| --- | --- |
| `name` | Acme Clinics |
| `offer` | AI scheduling for dental clinics |
| `icp` | small dental clinics (2–10 chairs) in the US |
| `tone` | direct, confident, helpful |
| `website` | https://acme.example |

Set it three ways:

```bash
afax init                                        # interactive wizard
afax context set offer "AI scheduling for clinics"
afax context ingest https://yourcompany.com      # extract automatically
```

## `afax context ingest <url>`

The flagship command. AFAX:

1. Fetches your homepage and strips it to readable text.
2. Also tries `/about`, `/pricing` and `/product` for richer context.
3. Sends up to 12 KB of corpus to your LLM and extracts a precise JSON profile: `name`, `offer`, `icp`, `tone`, plus `keyFacts[]` and `valueProps[]`.
4. Saves the profile fields (never overwriting a name you set manually) and stores every fact and value prop in persistent memory.

```bash
afax context ingest https://yourcompany.com
afax context show           # profile + learned facts
```

> **Note:** Without an LLM key, `ingest` still works — it stores the raw page text in memory so nothing is lost; run `afax init` and re-ingest to extract a structured profile.

## Persistent memory

Every agent writes durable notes about what it did ("Sourced 10 leads for 'SaaS founders'", "Drafted campaign X on email"), and the orchestrator records its plans and executions. These facts:

- live in the workspace's `data/memory.json` (capped at the most recent **500** facts);
- are scoped per agent (`prospect`, `sales`, `orchestrator`, `context`…);
- get injected into prompts as a compact "Known context" block (last 8 facts per scope), so agents remember what already happened across runs.

```bash
afax memory          # inspect the last 30 facts across all scopes
afax memory clear    # wipe memory for the active workspace
```

## How an agent prompt is built

Every generation call assembles, in order:

```text
1. Agent role          — e.g. "You are AFAX Outreach, a world-class SDR…"
2. Business profile    — name, offer, ICP, tone, website
3. Persistent memory   — last 8 facts in the agent's scope
4. The task            — your command's specific instruction
```

That is why `context ingest` is step one of the [quick start](#/quickstart): one good ingest upgrades every subsequent output of every agent.

## Memory and workspaces

Memory is **per workspace**. Switching companies with `afax workspace use` switches the whole memory — no cross-contamination between clients. See [Workspaces](#/workspaces).
