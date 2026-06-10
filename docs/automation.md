# 🤖 Automation — flows & event triggers

Flows are AFAX's Make/Zapier layer: named sequences of CLI subcommands that run in order — manually, on a schedule, or **automatically when events fire** (new lead, deal won, inbound reply, payment). Anything you can type, a flow can run — which means flows can drive every agent, including the orchestrator itself.

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

## Event triggers — flows fire automatically

The `--trigger` field is matched against real events emitted by the agents. When an event fires, every flow whose trigger matches runs immediately:

| Event | Emitted when | Trigger phrases that match |
| --- | --- | --- |
| `lead.new` | `prospect` saves new leads (AI, Hunter/Apollo, CSV import) | "new lead", "lead added" |
| `contact.new` | `crm contact add` | "new contact" |
| `deal.won` | `sales move --stage won` | "deal won", "closed won" |
| `message.received` | inbound message hits [`afax serve`](#/server) | "new message", "inbound", "reply" |
| `payment.received` | Stripe webhook confirms a payment | "payment", "invoice paid" |

Steps can use `{{placeholders}}` filled from the event data:

```bash
afax automation flow add "on-won" --trigger "deal won" \
  --steps "content post --topic 'we just closed {{deal}}'; finance report"

afax automation flow add "on-reply" --trigger "new message" \
  --steps "crm note {{email}} 'replied via {{channel}}: {{text}}'"
```

Available fields: `lead.new` → `count, target, email, name` · `deal.won` → `deal, value` · `contact.new` → `email, name, company` · `message.received` → `channel, from, name, email, text` · `payment.received` → `amount, email, source`.

A re-entrancy guard (depth 2) stops flows that emit events from looping forever. Triggers that match nothing (`"manual"`, `"weekly"`) simply never auto-fire — run those by hand or on a schedule:

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
