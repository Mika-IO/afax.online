# 🤝 CRM — contacts & interaction history

The CRM keeps one clean, unified record of every person your company touches. Other agents write into it automatically: [Prospect](#/prospect) mirrors every sourced lead, [Outreach](#/outreach) logs every real send.

## Contacts

```bash
afax crm contact add "jane@acme.com" --name "Jane Doe" --company "Acme" --title "CEO"
afax crm contact list
afax crm contact show "jane@acme.com"
```

Fields on `add`: `--name`, `--company`, `--title`, `--stage`. Name and company default sensibly from the email (`jane@acme.com` → name `jane`, company `acme`). Duplicate emails are rejected.

Contact stages (distinct from sales deal stages):

```text
lead → prospect → customer → churned
```

## Interaction history

```bash
afax crm note "jane@acme.com" "great discovery call, wants pricing"
afax crm contact show "jane@acme.com"     # profile + full dated history
```

Notes are timestamped and shown chronologically on the contact card. Automatic notes appear here too — e.g. `Outreach via email: <subject>` after a real send.

## How records flow in

| Source | What it creates |
| --- | --- |
| `afax crm contact add` | manual contact (`source: manual`) |
| `afax prospect …` | contact per lead (`source: prospect`, with fit score) |
| `afax prospect source <domain>` | contact per real Hunter.io result |
| `afax outreach … --live` (real send) | CRM note on the contacted lead |

## Data

Contacts live in `contacts.json`, notes in `crm_notes.json`, per [workspace](#/workspaces). Export everything with [`afax export`](#/export-import).
