# PATCH-219 — "Free images" opens on recommended photos, loads more, and credits Pexels

Status: AUTHORIZED (owner, 2026-09-30: "yes", with Milanote's image panel as the model).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-218 (`316aa678`)

## Why
Milanote's image panel opens on a "Recommended" feed of Pexels photos, so the user browses before
typing anything. Ours opens on an empty box until a search runs, and there is no way to see more than
the first 12 results.

Also (CTO):
- `app/api/pexels/route.ts` has **no authentication**, so anyone on the internet can spend our Pexels
  quota (by default 200 requests an hour);
- it passes `page` through unchecked;
- nothing is cached.

Pexels' guidelines ask for a visible link to Pexels.
(Multi-image upload is deferred: it needs placement changes in the save path. It is not part of this
patch.)

## Design
1. **Route** `app/api/pexels/route.ts`:
   - **Auth:** require a signed-in user, the same cookie-session pattern the knowledge routes use
     (`createRouteHandlerClient` + `auth.getUser()`). None → 401 `{ error: 'Sign in to search images' }`.
     (Its two callers, `ImageEditor` and `IconSelector`, are only used by signed-in editors; confirm
     this and say so.)
   - **Two modes:**
     - `?query=…` (1-100 chars after trimming) → `https://api.pexels.com/v1/search?query=…&per_page=24&page=N`;
     - no query → `https://api.pexels.com/v1/curated?per_page=24&page=N` (the Recommended feed).
   - `page`: an integer 1-50, default 1; anything else → 400.
   - **Cache:** curated uses `fetch(…, { next: { revalidate: 3600 } })`; search uses
     `{ next: { revalidate: 600 } }`. The response keeps Pexels' JSON shape (`photos`, `page`,
     `next_page`, …) so both callers keep working.
   - Errors: keep today's generic messages; never forward Pexels' raw body. A 429 from Pexels →
     429 `{ error: 'Image search is busy. Please try again in a minute.' }`.
2. **ImageEditor "Free images" tab** (`components/collabboard/editors/ImageEditor.tsx`):
   - When the tab is shown and nothing has been searched yet, load the curated feed (page 1) ONCE per
     open, with a heading **"Recommended"** above the grid. A search replaces it with the heading
     **"Results for "<query>""**. Clearing the box and submitting empty goes back to Recommended.
   - A **"Load more"** button under the grid appends the next page (`page + 1`, same mode). Hide it
     when `next_page` is absent. Show "Loading…" while it loads, and ignore double clicks.
   - A stale response must not overwrite a newer one: a search typed while Recommended is loading
     wins. Use a request counter or an AbortController.
   - **Credit line** under the grid (always visible on this tab): `Photos provided by Pexels`, with
     "Pexels" linking to `https://www.pexels.com` (`target="_blank" rel="noopener noreferrer"`). Keep
     the existing photographer credit on the saved image.
   - On a 401 or 429, show the route's message inline instead of an empty grid.
   - Do not touch the upload tab or the save logic (PATCH-218).
3. `IconSelector.tsx` needs no change unless the route's response shape changed (it must not); say so.

## Tests
- Route (`app/api/pexels/route.test.ts`, new; mock the auth client and `fetch`):
  - no user → 401, and Pexels not called;
  - no query → the curated URL with `per_page=24&page=1` and `revalidate: 3600`;
  - `query=cars&page=2` → the search URL with `page=2` and `revalidate: 600`;
  - `page=0`, `page=51` or `page=abc` → 400;
  - a 101-char query → 400;
  - Pexels 429 → 429 with the friendly message;
  - the API key header is sent, and it never appears in a response body.
- `ImageEditor.test.tsx`:
  - opening on Free images fetches the curated feed once and shows "Recommended";
  - a search shows "Results for "cars"";
  - "Load more" requests page 2 and appends (the grid grows);
  - with no `next_page`, there is no button;
  - the credit link points to pexels.com;
  - a slow Recommended response that arrives after a search does not replace the results.
- If `app/api/pexels/*.test.ts` is not in the vitest `include`, add the narrowest pattern
  (authorized) and confirm it appears in the JSON.
- **Mutations:**
  - remove the auth check → the 401 test fails;
  - remove the stale-response guard → its test fails.

## Allowed files
```
app/api/pexels/route.ts (+ new route.test.ts)
components/collabboard/editors/ImageEditor.tsx (+ ImageEditor.test.tsx)
vitest.config.ts   (one include pattern, only if needed)
```
Forbidden:
- `IconSelector.tsx` (unless the shape had to change; STOP first), `CanvasClient.tsx`,
  `usePadletSave.ts`, `imageEditStorage.ts`;
- the database, `package.json`, `next.config.ts`, `.env*`.

If a census pins these files, STOP and ask (spec line, code at file:line, proposed resolution).

Use the Grep/Read tools, or `rg` with `timeout 30`. Every test command is
`timeout 600 npx vitest run …`. No `ls` on the repo root, no curl of the dev server. Delete temp
files (bash: `/dev/null`, never `nul`). No stash/reset/restore/checkout/clean/commit/push; no
production build. Real tool calls only. Never print the Pexels key.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run app/api/pexels components/collabboard/editors
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-219.json
```
The failing FILE set must equal the 26-file baseline, and the new test file must be present. Compact
report. Do not commit.

**Live (CTO, own tab):**
- Image → Free images shows Recommended photos at once;
- "Load more" adds more;
- a search for "cars" shows results;
- the Pexels credit is visible;
- a signed-out request to `/api/pexels` gets 401.

## Commit message (verbatim)
```
feat(images): Free images opens on recommended photos and can load more

The Free images tab was empty until a search, and showed only the first
12 results. It now opens on Pexels' curated feed ("Recommended"), a
search shows "Results for ...", "Load more" appends the next page, and
the tab credits Pexels. The /api/pexels route now requires a signed-in
user (it was open to anyone, spending our quota), validates the page,
and caches responses.
```

## Addendum (CTO, 2026-09-30): live result
- Signed out, `GET /api/pexels?query=cars` → 401.
- Image → Free images: "Recommended" with 24 photos at once; "Load more" → 48; a search for "cars" →
  "Results for "cars"" with 24; the Pexels credit link is present. All `/api/pexels` calls 200.
- The curated page 1 is requested twice on open in `next dev` (StrictMode's double effect, dev only;
  the fetch cache serves the repeat).
