# 🚀 Marketing — channels, campaigns, publishing

The Marketing agent is a growth strategist: it manages your acquisition channel portfolio, designs concrete channel-specific campaigns, and publishes to real platforms.

## Acquisition channels AFAX actually runs

These are the channels AFAX can operate on its own. **Enabling a channel is not a cosmetic toggle** — it schedules a real, recurring action (via the [scheduler](#/scheduler)) that produces approvable work. Channels that need product-side mechanics (referral/affiliate rewards, in-person events, in-product virality) are intentionally **not** here: AFAX won't pretend to run what it can't.

```bash
afax marketing channel list
afax marketing channel seo enable     # schedules a real recurring job
afax marketing channel outreach disable
```

| Key | Channel | Cadence | Recurring action it schedules |
| --- | --- | --- | --- |
| `content` | Content Marketing | weekly | drafts a high-value article |
| `seo` | SEO | weekly | drafts SEO-targeted content |
| `email` | Email Marketing | weekly | drafts a nurture/newsletter email |
| `outreach` | Direct Outreach | daily | drafts a batch of cold emails (for approval) |
| `partnerships` | Partnerships | weekly | drafts partner outreach (for approval) |
| `pr` | PR / Earned Media | weekly | drafts a data-led press angle |
| `build-in-public` | Build in Public | weekly | drafts a social post |
| `ppc` | Ads / PPC | weekly | drafts a PAUSED Meta campaign to review |

The scheduled jobs run on the `afax cloud` heartbeat (or `afax schedule run`). Everything they produce lands as a **draft** — outbound items wait in [`afax approvals`](#/tasks); nothing is sent until you approve. Channel status (`active`/`idle`) also feeds the [status dashboard](#/orchestrator).

## Campaign design

```bash
afax marketing campaign --channel email --goal "activate trial users"
afax marketing campaigns                  # list saved campaigns
```

With an LLM, the agent returns a complete campaign: **name, hook, angle, audience, cadence, assets list, CTA, KPI and step-by-step plan** — grounded in your business profile and ICP. Campaigns are saved as drafts in the `campaigns` collection.

## Publishing to real platforms

```bash
# You write the message:
afax marketing publish --platform telegram --message "We shipped v2!" --live

# Or the agent writes it (platform-native, hook-first):
afax marketing publish --platform discord --topic "launch week recap" --live

# Instagram needs a public image URL:
afax marketing publish --platform instagram --topic "launch" \
  --image https://cdn.example.com/hero.png --live
```

| Flag | Meaning |
| --- | --- |
| `--platform` | `facebook` \| `instagram` \| `telegram` \| `slack` \| `discord` |
| `--message` | post text; omit to have the agent write it from `--topic` |
| `--topic` / `--goal` | what the agent should write about |
| `--image` | public image URL (required by Instagram) |
| `--link` | link attachment (Facebook) |
| `--live` | real publish (needs global `live` too — see [Safety](#/integrations)) |

Without `--live` (or with global `live` off) the post is **drafted** and saved to the `posts` collection as `pending` — nothing is published. Approve it later with [`afax approve <id>`](#/tasks). AFAX never reports a send it didn't actually make.

> **Note:** A **local** image path works too — with [`afax serve`](#/server) running and `publicUrl` set, AFAX hosts the file and uses the public URL automatically (this is how generated images reach Instagram in one command).

Platform setup guides: [Meta (FB/IG)](#/meta) · [Telegram / Slack / Discord](#/messaging).

## Paid ads (Meta)

```bash
afax marketing ads --goal "trial signups from dentists" --budget 20
afax config set live true
afax marketing ads --goal "trial signups from dentists" --budget 20 --live
```

The agent designs the campaign (name, objective, audience, headline, primary text). Dry-run saves it as a draft; **live** creates a real campaign **+ ad set** in your Meta ad account via the Marketing API — always **PAUSED**, with your daily budget, so nothing spends until you add creative and activate it in Ads Manager.

| Flag | Meaning | Default |
| --- | --- | --- |
| `--goal` | what the campaign should achieve | — |
| `--budget` | daily budget in USD (set on the ad set) | 10 |
| `--live` | create in Meta Ads (needs global `live` too) | off |

Requires `accessToken` + `adAccountId` in the [Meta integration](#/meta) (token needs `ads_management`).

## Typical loop

```bash
afax marketing channel build-in-public enable
afax marketing campaign --channel build-in-public --goal "200 waitlist signups"
afax content post --topic "what we learned automating outreach"
afax marketing publish --platform telegram --topic "ship log week 3" --live
```
