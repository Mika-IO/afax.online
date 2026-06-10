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

Email is used automatically by the [Outreach engine](#/outreach):

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
| Resend/SendGrid 4xx | Domain not verified, or `from` doesn't match the verified domain |
| `SMTP: server replied 5xx` | Wrong credentials, or provider requires an app password |
| `SMTP: timeout` | Host/port wrong, or provider only supports STARTTLS on 587 (AFAX uses implicit TLS 465) |
