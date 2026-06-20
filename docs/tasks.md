# ✅ Tasks & Approvals — background work, your sign-off

This is how AFAX "delivers finished work while you sleep" **honestly**: a task is a goal, a background worker prepares the real work, and anything that would go out waits for your one-click approval. AFAX never sends on its own, and never reports a send it didn't actually make.

## Tasks are goals

Create a task in plain language — it's an objective, not a checklist item:

```bash
afax task add "preparar outreach por email para 20 leads reais"
afax task list
```

Each task carries a `runState` as the worker moves it: `queued → running → awaiting_approval | done | failed`.

## The worker

```bash
afax work          # drain the queue once, from the terminal
```

For each queued task the worker runs the **goal-driven orchestrator**: it picks the real commands that accomplish the goal (using only real data sources — it never invents leads) and runs them. Read/prepare steps execute for real (sourcing, drafting, content, segmentation). Any **outbound** step is drafted into the approval queue instead of being sent.

On `afax cloud`, the worker runs automatically on every heartbeat tick — so you can close the app, and come back to work that's been prepared.

## The approval queue

Everything prepared-but-unsent waits here:

```bash
afax approvals               # list prepared items (nothing sent yet)
afax approve <id>            # do the REAL send now — you are the gate
afax reject <id>             # discard the draft
```

- **Approve** performs the real send, records the provider **receipt**, marks the lead `contacted`, and writes a CRM note — only now that it actually went out.
- Approval is the gate: it sends for real even if global `live` is off, because *you* explicitly authorized this one.
- Nothing in the queue is ever counted as delivered without a real receipt.

In the web panel, the **Tasks** view shows the same thing: task cards with their run state, a **Rodar fila** button, and an **Aprovações** inbox with one-click *Enviar* / *Descartar*.

## Why it works this way

The old behavior reported `ok` for sends that never happened ("dry-run"). That's gone. Outbound is one of two honest states: **sent** (with a receipt) or **pending approval** (clearly *not sent*). See the [Outreach](#/outreach) and [Marketing](#/marketing) pages — every channel funnels through this same queue.
