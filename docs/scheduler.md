# Scheduler

Natural-language recurring tasks, Hermes-style. AFAX stores schedules per workspace and executes everything due when `afax schedule run` is invoked — wire that single line to system cron and the company runs [24/7](#/vps).

## Creating schedules

```bash
afax schedule "every day at 09:00" --do "run --execute"
afax schedule "every 2 hours"      --do "prospect --target 'SaaS founders' --limit 5"
afax schedule "weekly"             --do "finance report"
afax schedule "every 30 min"       --do "schedule run"      # (don't actually do this one)
```

The `--do` value is any AFAX subcommand line (no `afax` prefix), tokenized like a shell — quotes work.

### Supported time expressions

| Expression | Interval |
| --- | --- |
| `hourly`, `every hour` | 1 h |
| `daily`, `every day` | 24 h |
| `weekly`, `every week` | 7 d |
| `every N min/minute/hour/day/week` | N × unit |
| `… at HH:MM` | first run aligned to that clock time (then the interval repeats) |
| anything else | **one-shot** — runs once on the next `schedule run` |

`"every day at 09:00"` therefore means: first run at the next 09:00 (local time), then every 24 h.

## Managing

```bash
afax schedule list      # ID, when, command, next run (UTC), run count
afax schedule rm <id>
```

## Executing

```bash
afax schedule run       # run everything currently due, update next-run times
```

Each due task is dispatched like a hand-typed command; failures are reported and don't block other tasks. One-shot tasks run once and won't be due again.

## True 24/7 via cron

AFAX doesn't daemonize — it borrows cron's reliability instead:

```bash
crontab -e
# check for due AFAX tasks every 15 minutes:
*/15 * * * * afax schedule run >> ~/.afax/cron.log 2>&1
```

Granularity: a task is executed by the **next cron tick after** it becomes due, so with `*/15` your "09:00" task runs between 09:00 and 09:15. Tighten the cron interval if you need tighter timing.

Multi-company crons use the env override:

```bash
*/15 * * * * AFAX_WORKSPACE=acme-clinics afax schedule run
*/15 * * * * AFAX_WORKSPACE=beta-saas    afax schedule run
```

Full VPS setup (Node install, env, logs, monitoring): [Running on a VPS](#/vps).

## Patterns

```bash
# The self-driving company
afax config set autonomy execute
afax schedule "every day at 09:00" --do "run --execute"

# Daily CFO report to your Telegram
afax schedule "every day at 18:00" \
  --do "marketing publish --platform telegram --topic 'daily numbers summary' --live"

# Weekly pipeline hygiene
afax schedule "weekly" --do "automation flow run pipeline-review"
```
