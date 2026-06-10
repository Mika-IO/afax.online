# 📊 Finance — cash flow, MRR, AI CFO

The Finance agent is your fractional CFO: it books revenue and expenses, issues invoices, computes MRR/ARR and net, and gives a sharp, honest read-out of what to do with the money this week.

## Booking money

```bash
afax finance revenue --source "Acme" --amount 99 --type subscription
afax finance revenue --source "Consulting gig" --amount 2500            # one-time
afax finance expense --label "Meta Ads" --amount 200
afax finance expense --label "VPS" --amount 12 --type opex
```

Revenue `--type` matters: anything matching *sub / recur / month* counts toward **MRR** (and ARR = MRR × 12). Everything else is one-time revenue.

> **Note:** Winning a deal (`afax sales move --deal X --stage won`) books its value as one-time revenue automatically — no double entry needed.

## Invoices — with real Stripe payment links

```bash
afax finance invoice --to "Acme" --amount 1500
# → Invoice INV-MQ8H… → Acme · $1,500 (status: sent)

# With Stripe connected + both live gates: creates a hosted payment link
afax connect stripe                      # secretKey (+ webhook signing secret)
afax config set live true
afax finance invoice --to "Acme" --amount 1500 --live
# → Payment link: https://buy.stripe.com/...
```

Invoices get an auto-generated number and start at status `sent`; unpaid invoices show as **outstanding** in the report.

**Closing the loop:** run [`afax serve`](#/server) and point a Stripe webhook (`checkout.session.completed`) at `/webhook/stripe`. When the customer pays, AFAX marks the invoice `paid`, **books the revenue automatically**, and fires the `payment.received` [event](#/automation) — so a flow can thank the customer or post the win. Keys: `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` env vars also work.

## The report

```bash
afax finance report
```

Outputs:

| Metric | Source |
| --- | --- |
| Total revenue | sum of all revenue records |
| MRR | sum of recurring-typed revenue |
| ARR | MRR × 12 |
| Total expenses | sum of all expenses |
| Net | revenue − expenses (green/red) |
| Outstanding invoices | invoices with status ≠ `paid` |

With an LLM configured (and at least one record), the report ends with a **3-bullet CFO read-out**: financial health, the biggest risk, and the single highest-leverage money move this week — grounded in your actual numbers.

## Data

`revenue.json`, `expenses.json`, `invoices.json` per [workspace](#/workspaces). Plain JSON — pull it into a spreadsheet any time, or `afax export` the whole company.
