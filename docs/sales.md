# 💰 Sales — pipeline, follow-ups, closing

The Sales agent is an AE who moves deals to close: it keeps the pipeline, computes a weighted forecast, drafts human follow-ups, and books revenue to [Finance](#/finance) when you win.

## Stages

```text
lead → qualified → demo → proposal → negotiation → won / lost
```

Each stage carries a probability weight used in the forecast:

| Stage | Weight |
| --- | --- |
| lead | 5% |
| qualified | 15% |
| demo | 30% |
| proposal | 50% |
| negotiation | 75% |
| won | 100% |

## Pipeline

```bash
afax sales pipeline                                            # view the board
afax sales pipeline --deal "Acme Enterprise" --value 12000 --stage proposal
afax sales pipeline --deal "Acme Enterprise" --value 15000     # update existing
```

`--deal` adds the deal if it doesn't exist (default stage: `qualified`) or updates value/stage if it does. The board groups deals by stage and shows **open pipeline** (sum of open deals) and **weighted pipeline** (sum × stage weight).

## AI follow-ups

```bash
afax sales followup --deal "Acme Enterprise"
```

Drafts a short, warm follow-up (under 120 words) designed to move the deal from its current stage to the next, in your brand tone. Saved to the `messages` collection; the agent remembers the draft in its memory.

## Moving deals

```bash
afax sales move --deal "Acme Enterprise" --stage negotiation
afax sales move --deal "Acme Enterprise" --stage won
```

Moving to `won` automatically books the deal value as **one-time revenue in Finance** — `afax finance report` reflects it immediately. Moving to `lost` removes it from the open pipeline.

## How it connects

- **Prospect → Sales**: qualified leads become deals when you create them (`sales pipeline --deal`); the orchestrator often proposes this step.
- **Sales → Finance**: `won` books revenue automatically.
- **Sales → CRM**: follow-up activity lands in agent memory; contact history lives in [CRM](#/crm).

## Example session

```bash
afax sales pipeline --deal "Beta Dental" --value 4800 --stage demo
afax sales followup --deal "Beta Dental"
afax sales move --deal "Beta Dental" --stage proposal
# … a week later
afax sales move --deal "Beta Dental" --stage won
afax finance report        # revenue now includes $4,800
```
