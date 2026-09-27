# PATCH-205 — A podcast episode plays on the canvas, like a YouTube video

Status: AUTHORIZED (PM decision, 2026-09-27). Owner: "the podcast should be brought onto the canvas
like YouTube, and from there the transcript dialog opens with the podcast's link, where the user
can copy the transcript."
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-204 (`a1d56509`)

## 0. What the CTO checked
- The transcript dialog's open button ALREADY uses the card's own URL for every tab except
  YouTube (`MediaPostTranscriptDialog.tsx` ~388: `activeTab === 'youtube' ? transcriptSourceUrl(url) : url`).
  A Spotify card's "Open in Spotify ↗" opens that episode. No change needed there.
- The canvas has NO podcast player: `getLinkEmbedKind` (`components/collabboard/LinkMediaEmbed.tsx`
  ~61) knows twitter, youtube, vimeo, tiktok, instagram, facebook and video files. A Spotify or
  Apple Podcasts link falls to `"none"` and shows as a plain link card.
- Every link renderer goes through `LinkMediaEmbed`: `PostCardContent.tsx` ~348,
  `FreeformPadletCards.tsx` ~3938, `LinkEditor.tsx` ~309. So this is one component plus sizing.
- There is no Content-Security-Policy `frame-src` in the app, so official iframes are not blocked.

Read first: `LinkMediaEmbed.tsx` (all), the three callers above (how `embedKind` affects card
layout and height), `lib/domain/knowledge/mediaPostVideoIdentity.ts` (PATCH-204's Spotify and Apple
episode parsing: reuse the id extraction, do not write a second parser), and the tests of
`LinkMediaEmbed` / `getLinkEmbedKind` if any exist (`rg`).

---

## 1. Design
Two new embed kinds, using each service's OFFICIAL embed player:
- **`spotify`**: an `open.spotify.com/episode/<id>` link (with `/intl-xx/`, `?si=` ignored) →
  `<iframe src="https://open.spotify.com/embed/episode/<id>" …>`. A `/show/<id>` link →
  `https://open.spotify.com/embed/show/<id>`: a show plays too, but offers no transcript, as in
  PATCH-204.
  - Height 152px, width 100%.
  - `allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"`.
  - `loading="lazy"`, `title="Spotify episode player"`, rounded like the other embeds.
- **`apple-podcasts`**: a `podcasts.apple.com/<cc>/podcast/<slug>/id<show>[?i=<episode>]` link →
  the same path on `embed.podcasts.apple.com` (keep `?i=`).
  - Height 175px for an episode, 450px for a show; width 100%.
  - `allow="autoplay *; encrypted-media *; clipboard-write"`.
  - `sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-top-navigation-by-user-activation"`.
  - `loading="lazy"`, `title="Apple Podcasts player"`.
- Build the iframe `src` ONLY from the extracted id/path, never by concatenating the raw pasted URL
  (no query passthrough except `i=`). An unparseable link stays `"none"` (a plain link card).
- `disableInteraction` is honoured exactly as for TikTok/Instagram (a `pointer-events-none`
  wrapper).
- Pocket Casts: no official embed player, so it stays a link card (PATCH-204 still offers "Add
  transcript" on it).
- Seeking from a citation is NOT in scope: these players do not register with
  `boardVideoPlayerRegistry`, so a podcast citation keeps opening the transcript text (the
  documented fallback).
- Card sizing: follow how each caller sizes a TikTok/Twitter embed. The card must show the whole
  player with no clipping. If a caller uses a fixed 16:9 box for every embed kind, give these
  kinds their fixed height instead.

## 2. Tests
- `getLinkEmbedKind`:
  - Spotify episode/show → `spotify`;
  - Apple episode/show → `apple-podcasts`;
  - Pocket Casts → `none`;
  - `open.spotify.com/track/…` (music) → `none`, as this is for podcasts only;
  - a lookalike host (`open.spotify.com.evil.test`) → `none`.
- `LinkMediaEmbed`:
  - a Spotify episode renders an iframe whose src is exactly `https://open.spotify.com/embed/episode/<id>`,
    with the tracking query gone;
  - Apple renders `https://embed.podcasts.apple.com/...?i=<n>`;
  - `disableInteraction` wraps with `pointer-events-none`.
- **Mutations:**
  1. Pass the raw URL into src → the exact-src test fails.
  2. Accept lookalike hosts → the lookalike test fails.

## 3. Allowed files
```
components/collabboard/LinkMediaEmbed.tsx (+ test)
components/collabboard/PostCardContent.tsx, components/collabboard/canvas/ui/FreeformPadletCards.tsx,
components/collabboard/editors/LinkEditor.tsx          (sizing only, if needed; say why)
lib/domain/knowledge/mediaPostVideoIdentity.ts          (only to EXPORT the existing id extraction for reuse)
```
Forbidden: the database, migrations, `package.json`, the transcript dialog, the import route. **Do
not touch the comments inside `isBlockingEditorModalOpen`.** If a census or source test pins the
embed kinds or the card markup, STOP and ask, with the conflict written out (spec line, code at
file:line, proposed resolution).

Use `rg` or `timeout 30` on every search. Every test command is `timeout 600 npx vitest run …`.
Delete temporary diagnostic files. Never use git stash, reset, restore, checkout, clean, commit or
push. Never run a production build. Real tool calls only.

## 4. Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run components/collabboard/LinkMediaEmbed lib/domain/knowledge components/collabboard/PostCardContent
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-205.json
```
The failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

**Live (owner's next podcast, or a CTO test card deleted afterwards):** a Spotify episode link on
the canvas shows the Spotify player and plays; "Add transcript" opens on the Spotify tab, and
"Open in Spotify ↗" opens that episode.

## 5. Commit message (verbatim)
```
feat(canvas): podcast episodes play on the board

A Spotify or Apple Podcasts link was a plain link card. It now embeds
the service's official player, like a YouTube video, built only from
the episode's parsed id so nothing from the pasted URL reaches the
iframe. The card's "Add transcript" keeps opening the episode itself,
where the person copies the text.
```
