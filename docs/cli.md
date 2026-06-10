# Command reference

Every command, flag and default in one page. All commands work as `afax <cmd>` (global install) or `node bin/afax.js <cmd>`.

## Conventions

- `--flag value` and `--flag=value` are equivalent; a `--flag` with no value is boolean `true`.
- Quotes work like a shell everywhere — including inside flow steps and `--do` strings.
- Outbound commands are dry-run unless **both** global `live` and per-command `--live` are set.

## Setup & meta

| Command | Description |
| --- | --- |
| `afax init` | Interactive setup: provider, model, key, business profile, autonomy |
| `afax help` | Command overview + LLM status |
| `afax version` | Version |
| `afax status` | Whole-company dashboard |
| `afax config show` | Current settings (keys masked) |
| `afax config get <path>` | Read a value by dotted path |
| `afax config set <path> <value>` | Write a value (`true`/`false`/numbers coerced) |
| `afax config path` | Location of the global config file |

## Context & memory

| Command | Description |
| --- | --- |
| `afax context ingest <url>` | Learn the company from its website |
| `afax context show` | Profile + learned facts |
| `afax context set <field> <value>` | Set `name` \| `offer` \| `icp` \| `tone` \| `website` |
| `afax memory` | Last 30 facts the agents remember |
| `afax memory clear` | Wipe memory (active workspace) |

## Workspaces

| Command | Description |
| --- | --- |
| `afax workspace list` | All companies (● = active) — alias `ws` |
| `afax workspace create "<name>"` | Create |
| `afax workspace use <name>` | Switch (creates if missing) |
| `afax workspace current` | Active slug |
| `afax workspace rm <name>` | Delete (not `default`) |
| `afax export [--out f] [--workspace s] [--with-secrets]` | Backup to JSON |
| `afax import <file> [--workspace s] [--merge]` | Restore / clone |

## Orchestrator

| Command | Description |
| --- | --- |
| `afax run` | Propose 2–4 next-best actions (plan only) |
| `afax run --execute [--steps N]` | Execute the plan (default cap 4) |

## Prospect 🎯

| Command | Description |
| --- | --- |
| `afax prospect --target "<icp>" [--limit N]` | AI-qualified lead profiles (default 10, max 50) |
| `afax prospect source <domain> [--limit N]` | Real contacts via Hunter.io |
| `afax prospect verify <email>` | Email deliverability check |

## Outreach 📨

| Command | Description |
| --- | --- |
| `afax outreach [--channel email\|whatsapp\|telegram] [--limit N] [--status s] [--live]` | Draft (and optionally send) personalized cold messages |
| `afax outreach preview` | Show the latest drafts in full |

## Marketing 🚀

| Command | Description |
| --- | --- |
| `afax marketing channel list` | The 16 acquisition channels |
| `afax marketing channel <key> enable\|disable` | Toggle a channel |
| `afax marketing campaign --channel <key> --goal "<g>"` | AI campaign design |
| `afax marketing campaigns` | List saved campaigns |
| `afax marketing publish --platform <p> [--message m] [--topic t] [--image url] [--link url] [--live]` | Post to facebook / instagram / telegram / slack / discord |

## Sales 💰

| Command | Description |
| --- | --- |
| `afax sales pipeline` | Board + open & weighted pipeline |
| `afax sales pipeline --deal "<n>" [--value v] [--stage s]` | Add / update a deal |
| `afax sales followup --deal "<n>"` | AI follow-up draft |
| `afax sales move --deal "<n>" --stage <s>` | Move stage (`won` books revenue) |

## Content ✍️

| Command | Description |
| --- | --- |
| `afax content blog\|email\|post\|social\|landing\|ad --topic "<t>" [--save f]` | Generate copy |
| `afax content image --prompt "<p>" [--size 1024x1024]` | Generate a real PNG |
| `afax content list` | Library |

## CRM 🤝

| Command | Description |
| --- | --- |
| `afax crm contact add "<email>" [--name] [--company] [--title] [--stage]` | Add contact |
| `afax crm contact list` | All contacts |
| `afax crm contact show "<email>"` | Card + history |
| `afax crm note "<email>" "<text>"` | Log an interaction |

## Automation 🤖

| Command | Description |
| --- | --- |
| `afax automation flow add "<name>" [--trigger t] --steps "cmd; cmd"` | Create flow |
| `afax automation flow list` | Flows + run counts |
| `afax automation flow run "<name>"` | Execute |
| `afax automation flow rm "<name>"` | Delete |

## Finance 📊

| Command | Description |
| --- | --- |
| `afax finance revenue --source "<s>" --amount N [--type subscription]` | Book revenue (recurring types count as MRR) |
| `afax finance expense --label "<l>" --amount N` | Book expense |
| `afax finance invoice --to "<who>" --amount N` | Issue invoice |
| `afax finance report` | Totals, MRR/ARR, net + AI CFO read-out |

## Scheduler 🗓️

| Command | Description |
| --- | --- |
| `afax schedule "<when>" --do "<cmd>"` | Add recurring/one-shot task |
| `afax schedule list` | Tasks + next runs |
| `afax schedule run` | Execute everything due (wire to cron) |
| `afax schedule rm <id>` | Remove |

## Integrations & deploy

| Command | Description |
| --- | --- |
| `afax connect email\|meta\|telegram\|slack\|discord\|leads\|media\|deploy` | Guided wizard |
| `afax connections` | ●/○ per platform + live state |
| `afax deploy [--src dir] [--run "<remote cmd>"] [--live]` | rsync to your VPS |

## Debugging

```bash
AFAX_DEBUG=1 afax run        # full stack traces
afax config path             # locate the data
```
