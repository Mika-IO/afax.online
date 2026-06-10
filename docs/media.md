# Integration — Media generation

Real image generation through any **OpenAI-compatible images endpoint** (`/v1/images/generations`). Default model `gpt-image-1`; `dall-e-3` and compatible third-party providers work too.

## Connect

```bash
afax connect media
# apiKey:  sk-...
# baseUrl: https://api.openai.com/v1   (or a compatible provider)
# model:   gpt-image-1
```

> **Note:** If your LLM provider is OpenAI, the media connector **reuses your `OPENAI_API_KEY` automatically** when no separate media key is set. Zero extra setup.

## Generate

```bash
afax content image --prompt "minimal orange A logo on black, brand hero"
afax content image --prompt "launch banner, bold type" --size 1024x1024
```

- Handles both `b64_json` and URL-style provider responses.
- PNGs are saved to `~/.afax/assets/img-<id>.png` and recorded in the content library (`afax content list`).

## Using generated images

Instagram (and most social APIs) need a **public URL**, not a local file:

1. Generate: `afax content image --prompt "..."`.
2. Host the PNG anywhere public — S3, your website, an image host.
3. Publish: `afax marketing publish --platform instagram --topic "launch" --image https://... --live`.

Automatic hosting of generated assets is on the [roadmap](#/roadmap).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Media: missing API key` | `afax connect media`, or use an OpenAI LLM key |
| `Media: provider returned no image` | Provider/model mismatch — check `model` and `baseUrl` |
| 400 on size | Provider doesn't support that `--size`; try `1024x1024` |
