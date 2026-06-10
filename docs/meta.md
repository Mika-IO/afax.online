# Integration — Meta (Facebook / Instagram / WhatsApp)

One connector covers the Meta Graph API: Facebook Page posts, Instagram publishing, and WhatsApp Cloud messages. Graph version `v21.0` by default.

## 1. Create a Meta app

1. Go to [developers.facebook.com](https://developers.facebook.com) and create an app.
2. Generate a **long-lived access token** with the permissions you need:
   - `pages_manage_posts` — post to a Facebook Page
   - `instagram_content_publish` — publish to an Instagram Business account
   - `whatsapp_business_messaging` — send WhatsApp Cloud messages
3. Collect the IDs:
   - **Page ID** (Facebook Page)
   - **IG user ID** (Instagram Business account linked to the page)
   - **WhatsApp phone-number ID** (from the WhatsApp Cloud setup)

You only need the pieces for the surfaces you'll use — Facebook-only is fine.

## 2. Connect

```bash
afax connect meta
# accessToken: EAAG...
# pageId:           (Facebook posts)
# igUserId:         (Instagram)
# whatsappPhoneId:  (WhatsApp)
```

Or `export META_ACCESS_TOKEN=EAAG...` and set the IDs via `afax config set integrations.meta.pageId ...`.

## 3. Publish & message

```bash
# Facebook Page post (optional --link)
afax marketing publish --platform facebook --message "We shipped!" --live

# Instagram (two-step container→publish, handled for you)
afax marketing publish --platform instagram --message "caption" \
  --image https://cdn.example.com/hero.png --live

# WhatsApp outreach (uses each lead's phone)
afax config set live true
afax outreach --channel whatsapp --live
```

> **Note:** **Instagram requires a public image URL** — not a local file. Generate art with `afax content image`, host the PNG anywhere public (S3, your site, an image host), then pass `--image`. Automatic hosting is on the [roadmap](#/roadmap).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Meta: need accessToken + pageId` | Connect the missing fields |
| OAuth error 190 | Token expired — generate a new long-lived token |
| `(#200) permissions error` | Token missing a permission above, or app not approved for it |
| Instagram container fails | Image URL not public, wrong format, or IG account isn't a Business account |
| WhatsApp 131030 | Recipient not in your allowed list (sandbox) — add the number or complete business verification |
