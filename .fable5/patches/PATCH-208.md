# PATCH-208 — Link cards look clean: a thumbnail with a play button, and the player loads on click

Status: AUTHORIZED (PM decision, 2026-09-28). Owner: "improve the images, thumbnail images for
YouTube and Spotify or general in link posts, they look awful."
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-207 (`c7e9c5f5`)

## 0. What the CTO found (live, owner's board)
- A video/podcast link card mounts the provider's LIVE player immediately (`LinkMediaEmbed`: YouTube
  and Vimeo through `BoardSeekableVideo`, Spotify and Apple via iframes from PATCH-205). At card
  width (~250px) YouTube's player chrome fills the card: its own title bar, channel avatar,
  share/watch-later icons, "Watch on YouTube". The title then appears three times (card header,
  player, link title). Spotify's player clips its text ("…e Rogan Experienc"). Every such card also
  loads a full player when the board opens (slow; the owner's Spotify card "took about a minute").
- A general link card shows its preview image forced into `h-32 object-cover` (a 128px strip), so
  most `og:image`s (1.91:1) are badly cropped (`FreeformPadletCards.tsx` ~3976,
  `PostCardContent.tsx` ~367).
- Favicons are fetched at 32px and shown at 10×10 (`google.com/s2/favicons…&sz=32`).

The established practice for the first problem is the **facade** (lite-youtube-embed): show the
thumbnail and a play button, and mount the real player only on click.

Read first: `components/collabboard/LinkMediaEmbed.tsx`, `BoardSeekableVideo.tsx`,
`boardVideoPlayerRegistry.ts` and how `seekBoardVideo` (CanvasClient) uses it; the link-card blocks
in `FreeformPadletCards.tsx` ~3925-4060, `PostCardContent.tsx` ~320-420 and `LinkEditor.tsx` ~300;
`buildYouTubeThumbCandidates` / `extractYouTubeId`; `padlet.metadata.linkImage`.

---

## 1. Design

### 1.1 Video and podcast cards: facade, then the player (inside `LinkMediaEmbed`)
- Kinds: youtube, vimeo, spotify, apple-podcasts. First render a **preview**:
  - the thumbnail, full width, 16:9, `object-cover`, rounded like the card;
  - thumbnail source: YouTube → the existing `buildYouTubeThumbCandidates` chain (hq first, with
    fallbacks); others → the card's `linkImage`. Pass it in as a new optional prop
    `previewImage` / `previewImageFallbacks`; the three callers already compute these;
  - a centred round play button (dark translucent circle, white triangle, ~44px, visible focus
    ring), `aria-label="Play"`;
  - a small provider badge bottom-left: `YouTube` / `Vimeo` / `Spotify` / `Apple Podcasts`, in white
    text on a dark translucent pill;
  - for spotify and apple-podcasts, use a square cover (1:1, max ~120px) beside the badge, on a
    dark tile of the player's height (152px Spotify, 175px Apple episode), instead of a stretched
    16:9, because podcast art is square;
  - no image available → a neutral dark tile with the badge and the play button (never a broken
    image icon).
- Clicking play (or Enter/Space) swaps in the REAL player: today's component for that kind, with
  autoplay where the provider allows it (`autoplay=1` / ReactPlayer `playing`). One click to play,
  not two.
- `disableInteraction` (line/graph modes) still applies: the facade is inert then.
- The drag grab-strip above embeds (`FreeformPadletCards` ~3953) stays.
- **Seeking from a citation must keep working.** Today a transcript citation seeks a MOUNTED
  YouTube/Vimeo player through `boardVideoPlayerRegistry`. With a facade, nothing is mounted.
  Register the facade in the same registry under the same identity. A seek request on a facade
  activates it (mounts the player) and applies the seek once the player is ready. A test must pin
  this. If the registry cannot express it without a larger change, STOP and ask.

### 1.2 General link cards (no embed)
- The preview image: `aspect-[1.91/1] w-full object-cover`, instead of `h-32`. Keep the
  fallback-chain `onError` logic.
- Favicon: request `sz=64`, render at 14×14 with `rounded-sm`.
- Same in `PostCardContent.tsx` and `LinkEditor.tsx`'s preview, so all three renderers match.

### What does not change
`displayMode` (both / image-only / info-only) behaviour, the link title/description, the card
header, the transcript menu and status, the data.

## 2. Tests
- `LinkMediaEmbed`:
  - YouTube renders the preview (thumbnail img, Play button, "YouTube" badge) and NO iframe/player
    until Play is clicked; after clicking, the player is mounted;
  - Spotify renders a square cover + badge, then the Spotify iframe after Play;
  - no image gives a dark tile with no `<img>`;
  - `disableInteraction` makes Play inert.
- Seek: a seek request for a YouTube identity whose card shows the facade mounts the player and
  delivers the seek (mock the player's ready + seekTo).
- Link card: a general link image has the 1.91:1 aspect class; the favicon uses `sz=64`.
- **Mutations:**
  1. Mount the player immediately → the "no iframe until Play" test fails.
  2. Ignore seeks on a facade → the seek test fails.

## 3. Allowed files
```
components/collabboard/LinkMediaEmbed.tsx (+ test)
components/collabboard/BoardSeekableVideo.tsx, components/collabboard/boardVideoPlayerRegistry.ts (+ tests)
components/collabboard/canvas/ui/FreeformPadletCards.tsx     (link block only: pass the preview props, image aspect, favicon)
components/collabboard/PostCardContent.tsx                   (same)
components/collabboard/editors/LinkEditor.tsx                (same)
```
Forbidden: the database, migrations, the link-preview route, `package.json`, CanvasClient (unless
the seek wiring truly requires it; STOP and ask first). **Do not touch the comments inside
`isBlockingEditorModalOpen`.** If a census or source test pins the card markup or the registry API,
STOP and ask, with the conflict written out (spec line, code at file:line, proposed resolution).

Use `rg` or `timeout 30` on every search. Every test command is `timeout 600 npx vitest run …`.
Delete temporary diagnostic files. Never use git stash, reset, restore, checkout, clean, commit or
push. Never run a production build. Real tool calls only.

## 4. Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run components/collabboard/LinkMediaEmbed components/collabboard/BoardSeekableVideo components/collabboard/boardVideoPlayer components/collabboard/PostCardContent
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-208.json
```
The failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

**Live (CTO, own tab):** the chess YouTube cards and the Spotify card show clean thumbnails with a
play button; one click plays; a Board AI transcript citation still moves the video (click a
timestamp citation → the facade opens and seeks).

## 5. Commit message (verbatim)
```
feat(canvas): link cards show a clean thumbnail; the player loads on click

Video and podcast cards mounted the provider's full player at once,
so a small card filled with YouTube's own chrome, Spotify clipped its
text, and every card loaded a player when the board opened. They now
show the thumbnail (square cover for podcasts) with a play button and
a provider badge, and mount the player on click -- a seek from a
transcript citation opens it too. Link preview images keep their
1.91:1 shape instead of a cropped strip, and favicons are sharp.
```
