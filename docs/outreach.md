# 📨 Outreach — personalized cold outreach

The Outreach agent is the sending half of your autonomous SDR. It drafts one short, specific, human message per lead and sends it through a real connector. **Dry-run by default** — nothing leaves your machine until both [safety gates](#/integrations) are open.

## The writing standard

The agent is prompted as a world-class SDR: no spam, no fake flattery, no "I hope this finds you well." Every message leads with a concrete observation about the prospect (their `signal` from [Prospect](#/prospect)), connects it to one clear value from your business profile, and ends with a low-friction ask. Emails get a subject under 6 words and a body under 90 words; WhatsApp/Telegram messages are 2–3 sentences.

## Drafting (dry-run)

```bash
afax outreach --channel email --limit 10
afax outreach preview                      # read the latest drafts in full
```

Flags:

| Flag | Meaning | Default |
| --- | --- | --- |
| `--channel` | `email` \| `whatsapp` \| `telegram` | `email` |
| `--limit` | max leads this run (cap 50) | 5 |
| `--status` | only leads with this status | all not yet `contacted` |
| `--live` | request a real send (gate 2) | off |

Targeting: leads with `status ≠ contacted`, oldest first, up to `--limit`. Every draft is stored in the `messages` collection with its dry-run/delivered state.

## Going live

```bash
afax config set live true                  # gate 1 — global
afax outreach --channel email --live       # gate 2 — this command
```

On a **real** send (both gates open, connector succeeded):

- the lead's status flips to `contacted` (it won't be targeted again);
- a CRM note is logged on the contact ("Outreach via email: <subject>");
- the message record is marked `delivered`.

On dry-run or failure, status does **not** change, so re-running after a fix targets the same leads.

## Channel requirements

| Channel | Needs | Docs |
| --- | --- | --- |
| `email` | Resend / SendGrid / SMTP configured + verified sender | [Email](#/email) |
| `whatsapp` | Meta access token + WhatsApp Cloud phone-number ID; lead needs a `phone` | [Meta](#/meta) |
| `telegram` | Bot token; the target chat id is taken from the lead | [Messaging](#/messaging) |

## Outreach needs an LLM

Personalization is the whole point — without a configured model the command stops and asks you to run `afax init`. There is no templated fallback for cold messages, deliberately: generic cold outreach burns domains and reputations.

> **Warning:** Cold email is regulated (CAN-SPAM, GDPR, LGPD…). Use a verified domain, include opt-out language where required, keep volumes sane, and only contact people with a legitimate basis. AFAX gives you the gates; compliance is on you.

## A full prospecting → outreach loop

```bash
afax context ingest https://you.com
afax prospect source target-company.com --limit 10
afax outreach --channel email --limit 10        # inspect drafts
afax outreach preview
afax config set live true
afax outreach --channel email --limit 10 --live # send for real
```
