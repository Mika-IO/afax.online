# Integration — Lead sourcing (Hunter.io / Apollo)

Turns [Prospect](#/prospect) from "plausible AI profiles" into **real, verifiable business contacts**. Two drivers: **Hunter.io** (domain search + email verification) and **Apollo.io** (people search).

## 1. Get a key

- [hunter.io](https://hunter.io) — free tier includes monthly searches/verifications.
- [apollo.io](https://apollo.io) — API key from Settings → Integrations → API.

## 2. Connect

```bash
afax connect leads            # driver: hunter|apollo, then the key
# or: export HUNTER_API_KEY=...   (auto-selects hunter)
# or: export APOLLO_API_KEY=...   (auto-selects apollo)
```

`afax connections` shows `Leads ●` once set.

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

Calls Hunter **Email Verifier** (Hunter driver only — Apollo marks verification in the search results instead). Statuses: `deliverable`, `risky`, `undeliverable`, `unknown`. Verify before going `--live` on outreach — bounces hurt your sender reputation.

Prefer importing lists you already have? See [`prospect import` CSV](#/prospect).

## Pipeline into outreach

```bash
afax prospect source target.com --limit 10
afax outreach --channel email --limit 10        # dry-run drafts for the new leads
afax config set live true
afax outreach --channel email --limit 10 --live
```
