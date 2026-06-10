# Export / import

Back up a company, move it between machines, or clone it into a new workspace. Exports are single portable JSON files containing the business profile, integration settings, **all data collections** and memory.

## Export

```bash
afax export --out acme.json                  # active workspace
afax export --workspace acme-clinics --out acme.json
afax export --with-secrets --out acme-full.json
```

| Flag | Meaning |
| --- | --- |
| `--out` | output file (default `afax-<slug>-<timestamp>.json`) |
| `--workspace` | export a specific workspace instead of the active one |
| `--with-secrets` | include API keys/tokens **unredacted** |

> **Warning:** By default every secret-looking field (apiKey, token, pass, webhook, key…) is replaced with `***REDACTED***`, making the file safe to store or share. `--with-secrets` produces a file that must be treated like a password.

## Import

```bash
afax import acme.json                          # → workspace from the file
afax import acme.json --workspace "Acme Copy"  # → custom workspace
afax import acme.json --merge                  # merge instead of replace
```

Behavior:

- The target workspace is created if needed; switch to it with `afax workspace use`.
- **Default**: imported collections replace existing files.
- **`--merge`**: profile fields are merged; data records are deduplicated by `id`; existing records are kept.
- Redacted placeholders never overwrite real credentials you already have — a merge can't clobber your keys with `***REDACTED***`.
- If the import contains redacted secrets, AFAX reminds you to reconnect platforms (`afax connect …`).

## Use cases

```bash
# Weekly backup (schedulable)
afax schedule "weekly" --do "export --out /backups/acme-weekly.json"

# Move a company laptop → VPS
afax export --with-secrets --out acme.json && scp acme.json vps:
# on the VPS: afax import acme.json && afax workspace use acme

# Clone a company as a sandbox
afax export --out acme.json
afax import acme.json --workspace "Acme Sandbox"
```
