# 🎯 Prospect — lead discovery & qualification

The Prospect agent is your autonomous SDR's research half: it brings in **real** leads from real sources (Hunter.io or a CSV), mirrors each into the [CRM](#/crm), and scores fit.

> **AFAX never invents leads.** There is no synthetic/AI-generated lead command — every lead comes from a verifiable source. Emails are sanitized on import so an address is always sendable.

## Real contacts via Hunter.io

```bash
afax prospect source acme.com --limit 10
```

Queries [Hunter.io](https://hunter.io) (or [Apollo](https://apollo.io) — pick the driver) and returns **real** people at that company: name, title, verified business email, confidence score and signal. Requires the [leads integration](#/leads):

```bash
afax connect leads          # driver hunter|apollo + key
# or: export HUNTER_API_KEY=...  /  export APOLLO_API_KEY=...
```

## Import from CSV (LinkedIn, Apollo, anything)

```bash
afax prospect import leads.csv
```

Zero-dependency CSV parser that recognizes common headers (`First Name`/`Last Name`, `Full Name`, `Email`, `Company`/`Organization`, `Position`/`Title`) — LinkedIn connection exports and Apollo exports work as-is. Deduplicates by email against existing leads, mirrors everything into the CRM, and fires the `lead.new` [event](#/automation).

## Verify a single email

```bash
afax prospect verify jane@acme.com
# → jane@acme.com → deliverable (score 92)
```

Uses Hunter's Email Verifier to check deliverability before you burn sender reputation.

## Where leads go

- Collection `leads` — full lead record, `status: new` → `contacted` (set automatically on a real outreach send).
- Collection `contacts` — CRM mirror at stage `lead` (deduplicated by email).

## Typical chains

```bash
# Import → outreach
afax prospect import leads.csv
afax outreach --channel email --limit 5

# Real contacts → verified outreach
afax prospect source competitor-customer.com
afax prospect verify ceo@competitor-customer.com
afax outreach --channel email --live      # after enabling live mode
```
