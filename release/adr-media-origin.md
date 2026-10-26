# ADR: film frames on a separate static origin

Status: Accepted (code), deploy pending. Date: 2026-10-25.

## Context

The film is scroll-scrubbed WebP frames (content/film-frames.json). Measured on
this branch, one full scroll fetches:

| Visitor | Bytes per full scroll |
| --- | --- |
| Desktop, canvas wider than 1080p (d4 tier) | 958 MiB |
| Desktop 1080p (d tier) | 586 MiB |
| Phone (p tier) | 163 MiB |

The app host is Netlify on the free plan. At these sizes a few dozen full
desktop visits a month reach its bandwidth allowance, and the site is paused
when the allowance runs out. Before this change every frame was also served
`max-age=0, must-revalidate`, so a return visit asked the network about each of
roughly 4,000 frames again. `public/film/clips` (1.1 GiB of mp4 masters) shipped
to the CDN with no runtime reference.

## Decision

1. Frames and flow maps are served from a separate static origin set by
   `NEXT_PUBLIC_FILM_ORIGIN` (Cloudflare Pages: unmetered bandwidth on the free
   plan, 20,000 files and 25 MiB per file per deploy; staged: 10,818 files,
   largest 0.6 MiB). Same bytes, no re-encode. Unset, the app serves them as before.
2. `scripts/verify-media.mjs` fails the build when any frame or flow map the
   engine will request is missing or not a WebP/PNG (10,817 checked), and,
   with an origin set, when 133 sampled (first, last and 4K-last frame per clip, plus flow) files at the origin are not
   byte-identical to `public/` or lack CORS. Only after that does it prune the
   frames from the app deploy.
3. The mp4 masters are pruned from the deploy copy on Netlify. The prune
   refuses to run outside CI/Netlify, so the authoring checkout is never touched.
4. `/film/*` is cached one day plus a week of stale-while-revalidate on both
   origins. Frames are not content-hashed, so `immutable` would be unsafe.

## Options considered

| Option | Quality | Free-tier risk | Cost |
| --- | --- | --- | --- |
| Separate media origin (chosen) | Unchanged | Removed | Small: one prefix, CORS headers, one gate |
| Re-encode frames smaller (AVIF, lower bitrate) | Drops | Lower | Breaks the full-quality requirement |
| Move the whole app to Cloudflare (OpenNext) | Unchanged | Removed | Adapter migration and re-verification of the agent's streaming |

## Consequences

- One more deploy (media) when frames change; the gate catches a stale origin
  because the samples must match `public/` byte for byte.
- Frame requests become cross-origin: preconnect is emitted in `app/layout.tsx`.
- Rollback: unset `NEXT_PUBLIC_FILM_ORIGIN` and redeploy; the app serves frames itself.

## Deploy steps (need the Cloudflare account)

```bash
node scripts/stage-media.mjs .media
npx wrangler pages deploy .media --project-name kushal-film
NEXT_PUBLIC_FILM_ORIGIN=https://kushal-film.pages.dev node scripts/verify-media.mjs
```

Then set `NEXT_PUBLIC_FILM_ORIGIN` in Netlify and redeploy.
