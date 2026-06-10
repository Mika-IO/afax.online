# Workspaces — multi-company

AFAX manages many companies side by side. Each workspace is a fully isolated company: its own business profile, integration credentials, data collections and memory, stored under `~/.afax/workspaces/<slug>/`.

Typical uses: an agency running AFAX per client, or a founder operating several products.

## Commands

```bash
afax workspace create "Acme Clinics"     # create (slug: acme-clinics)
afax workspace use acme-clinics          # switch the active company
afax workspace list                      # ● marks active; shows company, leads, deals
afax workspace current                   # print the active slug
afax workspace rm acme-clinics           # delete (cannot remove "default")
```

`ws` is an alias for `workspace`. Names are slugified: `"Acme Clinics"` → `acme-clinics`. `use` on a workspace that doesn't exist creates it.

> **Note:** `create` does **not** switch automatically — run `workspace use` after, or just `use` directly.

## Shared vs isolated

| Scope | Lives where | Examples |
| --- | --- | --- |
| **Shared (global)** | `~/.afax/config.json` | LLM provider + keys, autonomy, `live` flag |
| **Isolated (per workspace)** | `workspaces/<slug>/` | business profile, integrations (email, Meta, …), leads, deals, content, campaigns, finance, schedules, memory |

So you pay for one LLM key, but each client gets its own email sender, Telegram bot, brand voice and pipeline.

## Forcing a workspace per command

The `AFAX_WORKSPACE` env var overrides the active pointer without touching config — ideal for cron lines that operate different companies:

```bash
AFAX_WORKSPACE=acme-clinics afax run --execute
AFAX_WORKSPACE=beta-saas    afax finance report
```

## Moving companies between machines

Use [export / import](#/export-import):

```bash
afax export --workspace acme-clinics --out acme.json   # secrets redacted by default
afax import acme.json --workspace "Acme Clinics"
```

## On disk

```text
~/.afax/workspaces/acme-clinics/
├── config.json      # business profile + integrations
└── data/
    ├── leads.json
    ├── contacts.json
    ├── deals.json
    ├── campaigns.json
    ├── content.json
    ├── flows.json
    ├── revenue.json  expenses.json  invoices.json
    ├── messages.json  posts.json  crm_notes.json
    ├── schedule.json
    └── memory.json
```

Everything is plain JSON — readable, diffable, backupable.
