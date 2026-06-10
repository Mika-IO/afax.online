# Integration — Deploy (SSH / rsync)

Ship a local folder to your VPS and optionally run a remote command — the "publish my product" leg of the pipeline. AFAX shells out to your system `ssh` and `rsync` (both required locally), authenticating with your SSH key.

## Connect

```bash
afax connect deploy
# host: vps.example.com
# user: deploy
# path: /var/www/app
# key:  ~/.ssh/id_ed25519     (optional — default SSH agent/keys used otherwise)
```

## Dry-run first (always the default)

```bash
afax deploy --src ./dist
#   Would run:
#   rsync -az --delete ./dist deploy@vps.example.com:/var/www/app
```

The dry-run prints the exact `rsync` (and `ssh`) commands without executing anything.

## Go live

```bash
afax config set live true
afax deploy --src ./dist --run "systemctl restart app" --live
```

| Flag | Meaning | Default |
| --- | --- | --- |
| `--src` | local folder to sync | `./` |
| `--run` | command to execute on the host after sync | none |
| `--live` | actually execute (needs global `live` too) | off |

> **Warning:** rsync runs with `--delete` — files on the server that don't exist in `--src` are removed from the target path. Point `path` at a dedicated directory.

Host keys are accepted on first connect (`StrictHostKeyChecking=accept-new`); subsequent changes to the host key still fail loudly.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Deploy not configured` | `afax connect deploy` — host, user and path are all required |
| `rsync failed: … (is it installed?)` | Install rsync locally (`brew install rsync` / `apt install rsync`) |
| `Permission denied (publickey)` | Wrong `key` path, or the public key isn't in the server's `authorized_keys` |
| `rsync exited 23` | Target path doesn't exist or isn't writable by `user` |

Deploying AFAX **itself** to run 24/7 on a server is a different topic — see [Running on a VPS](#/vps).
