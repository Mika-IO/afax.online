# Orchestrator & autonomy

The orchestrator is the CEO's chief of staff. It reads the **whole company state**, recalls what it did recently, asks your LLM for the 2–4 highest-leverage next actions, and — with your permission — executes them.

## `afax status` — the dashboard

```bash
afax status
```

One screen with every module's key numbers: leads sourced, contacts, active channels (of 16), campaigns, content pieces, open deals, open pipeline value, closed-won value, flows, revenue, MRR, net — plus the LLM/autonomy/outbound state line.

## `afax run` — plan

```bash
afax run
```

What happens:

1. **Snapshot** — counts and sums across all collections (leads, deals, pipeline value, MRR…).
2. **Recall** — the last 6 orchestrator memories ("Proposed: …", "Executed 3 actions: …"), so it doesn't repeat itself.
3. **Decide** — the LLM receives your business profile, the state snapshot, recent actions, and a fixed menu of available commands. It returns strict JSON: one sentence of reasoning plus concrete actions.
4. **Present** — the plan is printed with the *why* for each action. In `suggest` mode (default) nothing runs.

The action menu the orchestrator may use (verbatim, with concrete arguments):

```text
prospect source <domain> --limit <n>
marketing channel <key> enable
marketing campaign --channel <key> --goal "<goal>"
content blog|email|post --topic "<topic>"
sales pipeline --deal "<name>" --value <n>
sales followup --deal "<name>"
crm contact add "<email>"
finance report
```

> **Note:** The menu contains no outbound senders — the orchestrator builds your company but never emails anyone behind your back. Outreach stays a deliberate, human-triggered (or explicitly scheduled) act with its own [two safety gates](#/integrations).

## `afax run --execute` — act

```bash
afax run --execute              # run the plan, up to 4 actions
afax run --execute --steps 2    # cap the number of executed actions
```

Each action is dispatched through the same CLI router you use by hand. Failures are caught and reported per action; the run continues. The result is written to memory so the next run knows what happened.

## Autonomy modes

```bash
afax config set autonomy suggest    # default — propose only
afax config set autonomy execute    # afax run always executes
```

With `autonomy execute`, plain `afax run` behaves like `run --execute`. Combine with the [scheduler](#/scheduler) for a self-driving company:

```bash
afax config set autonomy execute
afax schedule "every day at 09:00" --do "run --execute"
# system crontab:
*/15 * * * * afax schedule run
```

## Memory loop

After every run the orchestrator remembers what it proposed or executed. Over days this becomes a trajectory: it sees that prospecting already happened, that content exists but no campaign uses it, that a deal sits in `proposal` — and plans accordingly. Inspect with:

```bash
afax memory
```

## Requirements

The orchestrator needs an LLM to reason. Without one, `afax run` tells you to run `afax init` — every other module still works offline with templated output.
