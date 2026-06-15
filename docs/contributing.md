# Contributing

Issues and PRs are welcome. AFAX optimizes for being small, readable and dependency-free — contributions should keep it that way.

## Ground rules

1. **Zero runtime dependencies.** If a feature seems to need a package, it probably needs ~60 lines of stdlib instead (see the SMTP client or the `.env` loader). Dev-time tooling is also avoided — `node --test` is the whole test stack.
2. **Match the module style.** One concern per file, header comment saying what it does, named exports, small functions. Read two existing agents before writing a third.
3. **Every outbound action goes through the registry.** New connectors must be called via the guarded `publish()`/`dm()` dispatch (or an equivalent gate) so dry-run safety cannot be bypassed.
4. **Add a unit test for new logic** in `test/unit.test.js` — especially parsers, data transforms, and anything with edge cases.
5. **Honest docs.** If you ship a feature, update the relevant page in `docs/` and the [roadmap](#/roadmap). Don't document aspirations as features.

## Dev setup

```bash
git clone https://github.com/mika-io/afax.online.git
cd afax.online
npm test                                   # node --test

# run against an isolated data dir (never touches your real ~/.afax):
AFAX_HOME=/tmp/afax-dev node bin/afax.js status
AFAX_DEBUG=1 node bin/afax.js run          # full stack traces
```

`AFAX_HOME` + `AFAX_WORKSPACE` env vars make it easy to test multi-company behavior without polluting anything.

## Adding an agent

1. Create `src/agents/yourthing.js`: instantiate `Agent` with a key, emoji, role and a sharp system prompt; export a `cmd(args)`.
2. Route it in `src/cli.js` (`dispatch` switch + the `help()` text).
3. Store data via `store.js` collections; write meaningful actions to memory with `agent.note()`.
4. Consider whether the orchestrator should know about it — if so, add a safe (non-outbound) command to its menu in `orchestrator.js`.

## Adding an integration

1. Create `src/integrations/yourplatform.js` with a `status()` and the send/query functions, using `http()`.
2. Wire it through `registry.js` (status row + `publish`/`dm` case).
3. Add a wizard entry in `connect.js` and defaults in `config.js` (`WS_DEFAULTS.integrations`).
4. Support an env var override in `config.js` so keys can stay off disk.
5. Document it: a `docs/yourplatform.md` page + a row in [Integrations](#/integrations).

## Docs site

The docs are plain markdown in `docs/`, rendered client-side by `docs.html` (GitHub Pages). Add a page = add the `.md` file + one entry to the manifest at the top of `docs.html`. Internal links use hash routes: `[text](#/page)`.

## License note

By contributing you agree your contribution is licensed under the repository's [MIT license](https://github.com/mika-io/afax.online/blob/main/LICENSE).
