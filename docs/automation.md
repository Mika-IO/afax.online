# 🤖 Automation — flows

Flows are AFAX's Make/Zapier layer: named sequences of CLI subcommands that run in order. Anything you can type, a flow can run — which means flows can drive every agent, including the orchestrator itself.

## Anatomy of a flow

```text
flow = { name, trigger, steps: ["<afax subcommand>", ...] }
```

Steps are separated by `;` and tokenized like a shell — single and double quotes work as expected.

## Commands

```bash
# Create
afax automation flow add "welcome" --trigger "new lead" \
  --steps "content email --topic onboarding; sales followup --deal Acme"

# Inspect
afax automation flow list          # name, trigger, steps, run count

# Run
afax automation flow run "welcome"

# Remove
afax automation flow rm "welcome"
```

Each step is dispatched through the regular CLI router. A failing step is reported and the flow **continues** with the next step. Run counts and last-run timestamps are tracked.

## Triggers

The `--trigger` field is a label describing *when you intend* the flow to run (`"new lead"`, `"weekly"`, `"manual"`). Execution is currently manual (`flow run`) or scheduled — event-driven triggers (webhooks firing flows automatically) are on the [roadmap](#/roadmap).

To run a flow on a schedule:

```bash
afax schedule "every day at 08:00" --do "automation flow run welcome"
```

## Recipes

```bash
# Morning routine: report + fresh leads + a content piece
afax automation flow add "morning" --trigger "daily" --steps \
  "finance report; prospect --target 'solo SaaS founders' --limit 5; content post --topic 'daily build update'"

# Reactivation push
afax automation flow add "reactivate" --trigger "stale lead" --steps \
  "content email --topic 'we miss you'; crm note x@y.com 'reactivation sent'"

# Full autonomous cycle (the orchestrator decides, then you get the numbers)
afax automation flow add "autopilot" --trigger "cron" --steps \
  "run --execute; finance report"
```

> **Note:** Steps run with the same safety rules as manual commands — an outbound step still needs global `live` **and** `--live` inside the step text to actually send. See [Safety](#/integrations).
