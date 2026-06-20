# Running 24/7 on a VPS

The end state: AFAX installed on a cheap VPS, working around the clock — prospecting, drafting, planning, reporting — and delivering finished work to the CEO (you) on Telegram or email. This guide takes a fresh Ubuntu/Debian box to that state.

## 1. Provision

Any $5-tier VPS works (Hetzner, DigitalOcean, Lightsail…). AFAX is a CLI with JSON files — it needs almost nothing: 512 MB RAM and a few MB of disk.

```bash
ssh root@your-vps

# basics + Node 22 LTS
apt update && apt -y upgrade
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt -y install nodejs git

# non-root user for AFAX
adduser --disabled-password --gecos "" afax
su - afax
```

## 2. Install AFAX

```bash
git clone https://github.com/mika-io/afax.online.git
cd afax.online
npm install -g . || sudo npm install -g .
afax version
```

## 3. Configure

Run the wizard, or copy a company you already built locally:

```bash
# Option A — fresh setup on the server
afax init
afax context ingest https://yourcompany.com

# Option B — move your local company over
# (local)  afax export --out acme.json --with-secrets   # careful: includes keys
# (local)  scp acme.json afax@your-vps:
# (server) afax import acme.json --workspace "Acme"
#          afax workspace use acme
```

Keys: prefer environment over disk. Put them in `~/.afax-env` (chmod 600) and source it from cron lines, or use `afax config set` if you accept keys on disk.

```bash
# ~/.afax-env
export ANTHROPIC_API_KEY=sk-ant-...
export TELEGRAM_BOT_TOKEN=123:abc
export AFAX_LIVE=1
```

## 4. Define the autonomous routine

```bash
afax config set autonomy execute

# the company plans & acts every morning
afax schedule "every day at 09:00" --do "run --execute"

# fresh leads twice a day
afax schedule "every 12 hours" --do "prospect source acme.com --limit 5"

# evening report to the CEO's Telegram
afax schedule "every day at 18:00" \
  --do "marketing publish --platform telegram --topic 'todays status: leads, pipeline, money' --live"

afax schedule list
```

## 5. Run the inbound server (the ears)

[`afax serve`](#/server) receives replies (Telegram, WhatsApp, email), Stripe payments and hosts your images. Run it under systemd:

```text
# /etc/systemd/system/afax-serve.service
[Unit]
Description=AFAX inbound server
After=network.target

[Service]
User=afax
EnvironmentFile=/home/afax/.afax-env
ExecStart=/usr/bin/afax serve
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now afax-serve
curl -s localhost:8787/health        # {"ok":true}
```

Put it behind Caddy/Nginx for TLS and set `afax config set integrations.server.publicUrl https://afax.yourdomain.com`.

## 6. Wire cron (the heartbeat)

```bash
crontab -e
```

```text
*/15 * * * * . $HOME/.afax-env; afax schedule run >> $HOME/.afax/cron.log 2>&1
```

That single line is the whole daemon: every 15 minutes AFAX wakes, executes whatever is due, and exits. No long-running process to crash, leak, or babysit — cron has been doing 24/7 for fifty years.

Multiple companies:

```text
*/15 * * * * . $HOME/.afax-env; AFAX_WORKSPACE=acme  afax schedule run >> $HOME/.afax/acme.log 2>&1
*/15 * * * * . $HOME/.afax-env; AFAX_WORKSPACE=beta  afax schedule run >> $HOME/.afax/beta.log 2>&1
```

## 7. Observe

```bash
tail -f ~/.afax/cron.log        # what ran and what it did
afax status                     # the dashboard, any time you ssh in
afax memory                     # the agents' own account of their work
afax schedule list              # next-run times, run counts
```

For push-style visibility, make reporting part of the routine (step 4) — the evening Telegram message *is* your monitoring.

## 8. Backups

Everything lives under `~/.afax`. Two options:

```bash
# JSON export per workspace (secrets redacted — safe to store anywhere)
afax export --out backup-$(date +%F).json

# or just archive the whole home
tar czf afax-backup-$(date +%F).tgz ~/.afax
```

Add either as a weekly schedule or cron line.

## Hardening checklist

- SSH keys only (`PasswordAuthentication no`), non-root user, `ufw allow ssh && ufw enable`.
- `chmod 600` on any file holding keys; prefer env vars over config where possible.
- Keep global `live` **off** until your dry-run previews look right for a few days: remove `AFAX_LIVE=1` and watch `cron.log`.
- Unattended upgrades for the OS; `git pull && npm install -g .` occasionally for AFAX.
