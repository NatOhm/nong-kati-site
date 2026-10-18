# Social preview cache refresh (Facebook / LINE / Discord)

*Written 2026-10-18 after the OG-card redesign (Mitr fonts, mascot, Thai copy).*

## How the cache-busting works (no action needed per deploy)

Next.js emits the share image URL with a **content hash query**:

```
<meta property="og:image" content="https://nongkatistore.com/opengraph-image?<hash>"/>
```

The hash is derived from `src/app/opengraph-image.tsx` and its exports. Editing the
card changes the hash, so the next deploy serves the crawlers a **new URL** — they
cannot serve the old PNG from a cache keyed on the old URL. Verify with:

```sh
curl -s https://nongkatistore.com/ | grep -oE '<meta[^>]+og:image[^>]+>'
```

What the hash does NOT bust: Facebook caches the **whole unfurl per page URL**
(title + image together). Until Facebook re-scrapes the page, it may still show the
old preview even though the image URL changed. The manual triggers below force it.

## Per-platform refresh

### Facebook / Instagram (Meta Sharing Debugger)

Requires a logged-in FB session with access to the page that shares the link:

1. Open <https://developers.facebook.com/tools/debug/?q=https%3A%2F%2Fnongkatistore.com%2F>
2. Click **Scrape Again** (and **Fetch new scrape information** when the image
   itself changed). Repeat for any shared deep link that should update
   (product pages, `/orders/lookup`).
3. The debugger shows the exact `og:image` URL it sees — confirm it carries the
   new `?<hash>`.

No code deploys an instant FB refresh — Scrape Again is the only force-refresh.

### LINE

LINE has **no debugger**. The crawler caches per URL on first share and re-crawls
after its TTL. Two options:

- Wait for the LINE cache to expire (typically well under a day), or
- Share the link with a cache-buster query — `https://nongkatistore.com/?v=2` —
  which LINE treats as a new URL and scrapes fresh.

The `og:image` content-hash already guarantees the image inside is current.

### Discord

Discord caches unfurls per URL for a short window (roughly 30 minutes, keyed on
the page's cache headers). Options:

- Wait it out, or
- Share with a buster query — `https://nongkatistore.com/?v=2`.

Bot webhook embeds (the แจ้งเตือน pings from `src/lib/notify.ts`) do **not** use
the OG image — they use `nk_notify_embed_image` / footer URLs — so Discord order
notifications are unaffected by crawler caching.

## What is safe to expect

| Surface                            | Updates on deploy?      | Manual force?                       |
| ---------------------------------- | ----------------------- | ----------------------------------- |
| `og:image` bytes at the hashed URL | yes (content hash)      | n/a                                 |
| FB page-post preview               | no — cached per page URL| Sharing Debugger → **Scrape Again** |
| LINE share preview                 | no — cached per URL     | buster query or TTL                 |
| Discord link preview               | no — short TTL          | buster query or wait                |
