# Integration — Lead sourcing (Hunter.io)

Turns [Prospect](#/prospect) from "plausible AI profiles" into **real, verifiable business contacts**. Backed by the Hunter.io API.

## 1. Get a key

Create an account at [hunter.io](https://hunter.io) — the free tier includes monthly searches/verifications to start with.

## 2. Connect

```bash
afax connect leads
# or: export HUNTER_API_KEY=...
```

`afax connections` shows `Leads (Hunter) ●` once set.

## 3. Source real contacts

```bash
afax prospect source acme.com --limit 10
```

Calls Hunter **Domain Search** and saves each result as a lead + CRM contact:

| Field | From Hunter |
| --- | --- |
| name | first + last name |
| title | position |
| email | the discovered address |
| verified | ✓ when Hunter's verification status is `valid` |
| score | Hunter confidence (0–100) |
| signal | department (e.g. `dept: executive`) |

## 4. Verify before sending

```bash
afax prospect verify jane@acme.com
# → jane@acme.com → deliverable (score 92)
```

Calls Hunter **Email Verifier**. Statuses: `deliverable`, `risky`, `undeliverable`, `unknown`. Verify before going `--live` on outreach — bounces hurt your sender reputation.

## Pipeline into outreach

```bash
afax prospect source target.com --limit 10
afax outreach --channel email --limit 10        # dry-run drafts for the new leads
afax config set live true
afax outreach --channel email --limit 10 --live
```
