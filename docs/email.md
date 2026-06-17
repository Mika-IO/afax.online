# Integration — Email

Real email sending with three drivers: **Resend**, **SendGrid**, or **raw SMTP** over implicit TLS (port 465) — the SMTP client is built into AFAX, zero dependencies.

## 1. Get a sender

- Create an account at [Resend](https://resend.com) or [SendGrid](https://sendgrid.com) and **verify your sending domain** (mandatory for deliverability), or
- use any SMTP provider (e.g. your transactional mail host).

> **Warning:** For cold outreach, use a dedicated sending domain (not your main one), warm it up, and keep volumes low. Burned domains are expensive.

## 2. Connect

```bash
afax connect email
# driver: resend | sendgrid | smtp
# from:   you@yourdomain.com   (must be verified)
# apiKey: re_...  or  SG....
# (smtp only) host, port (465), user, pass
```

Or via environment — keys never touch disk:

```bash
export RESEND_API_KEY=re_...        # also auto-selects the resend driver
export AFAX_EMAIL_FROM=you@yourdomain.com
# or: export SENDGRID_API_KEY=SG....
```

Field reference:

| Field | Notes |
| --- | --- |
| `driver` | `resend` · `sendgrid` · `smtp` |
| `from` | Verified sender address — required by every driver |
| `apiKey` | Resend / SendGrid key |
| `host` / `port` / `user` / `pass` | SMTP only; implicit TLS, default port 465 |

## 3. Send

### One email to a specific address — `afax email send`

When you want to mail **one exact recipient** (not your lead list), use the direct
command. The recipient is validated and used verbatim — this is the tool the chat
agent uses when you say "email me at …", so it can't drift to the wrong address:

```bash
afax email send --to you@example.com --subject "Hello" --body "Test from AFAX"   # dry-run
afax config set live true
afax email send --to you@example.com --subject "Hello" --body "…" --live          # real send
afax email status                                                                 # driver / from / state
```

An invalid address is rejected before any API call. Sends respect the same
live/dry-run gate as everything else.

### Bulk cold outreach — `afax outreach`

Email is also used automatically by the [Outreach engine](#/outreach), which sends
to **leads** (not arbitrary addresses):

```bash
afax outreach --channel email --limit 5        # dry-run drafts
afax config set live true
afax outreach --channel email --live           # real send
```

`afax connections` shows `Email ● connected` once driver + key + from are valid.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `No sender. Set integrations.email.from` | Set the `from` address (`afax connect email` or `AFAX_EMAIL_FROM`) |
| `Missing Resend API key` | Key not set in config or env |
| `Invalid recipient address` | The `--to` value isn't a valid email — AFAX refuses to send misdirected mail |
| **Resend 422** | Sending domain of `from` not verified, **or** the account is still in test mode (which only allows sending to your own verified address). Verify at [resend.com/domains](https://resend.com/domains). AFAX surfaces this hint in the error. |
| Resend/SendGrid 4xx | Domain not verified, or `from` doesn't match the verified domain |
| `SMTP: server replied 5xx` | Wrong credentials, or provider requires an app password |
| `SMTP: timeout` | Host/port wrong, or provider only supports STARTTLS on 587 (AFAX uses implicit TLS 465) |
