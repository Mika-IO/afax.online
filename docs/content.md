# ✍️ Content — copy & media production

The Content agent is a senior copywriter that writes in your brand voice (from the [business profile](#/context)), leads with strong hooks, and matches each format's conventions. It also generates **real images** through your media provider.

## Text formats

```bash
afax content blog    --topic "sales automation for solo founders"
afax content email   --topic "cold outreach that gets replies"
afax content post    --topic "why founders need AI"        # social/thread
afax content landing --topic "AFAX launch page"
afax content ad      --topic "automated prospecting"
```

| Format | What you get |
| --- | --- |
| `blog` | Structured post: title, intro, 3–5 sections with headers, conclusion (~600 words) |
| `email` | Subject line + body under 150 words + CTA |
| `post` / `social` | Punchy, hook-first, platform-native post or thread |
| `landing` | Headline, subhead, 3 benefit bullets, CTA |
| `ad` | 3 headlines + 3 primary texts |

Every piece is saved to the content library; add `--save out.md` to also write a file:

```bash
afax content blog --topic "automation ROI" --save posts/roi.md
afax content list           # browse the library
```

## Image generation

```bash
afax content image --prompt "minimal orange A logo on black, brand hero"
afax content image --prompt "product screenshot mockup" --size 1024x1024
```

Generates a real PNG via an OpenAI-compatible images endpoint (default model `gpt-image-1`; works with DALL·E 3 and compatible providers) and saves it under `~/.afax/assets/`. Requires the [media integration](#/media):

```bash
afax connect media        # apiKey, baseUrl, model
```

> **Note:** If you already use an OpenAI key as your LLM, image generation reuses it automatically when no separate media key is set.

## Feeding the rest of the company

```bash
# Content → Marketing: publish what you wrote
afax content post --topic "ship log week 3"
afax marketing publish --platform telegram --topic "ship log week 3" --live

# Content → Outreach: image for an Instagram campaign
afax content image --prompt "campaign hero, orange on black"
# host the PNG anywhere public, then:
afax marketing publish --platform instagram --topic "launch" --image https://... --live
```

The orchestrator regularly proposes content actions when the library is thin relative to your active channels.
