# PATCH-286 — Excalidraw's fonts are served by our own app, not unpkg.com

Status: AUTHORIZED (owner, 2026-10-05: "you can implement 280 up to and including 284+"; the plan named "self-host
Excalidraw assets" as part of 284+).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`

## Why
`components/collabboard/editors/ExcalidrawWrapper.tsx` (~L83) sets
`window.EXCALIDRAW_ASSET_PATH = "https://unpkg.com/@excalidraw/excalidraw/dist/"`. Every drawing editor therefore
fetches its fonts from an outside host: an availability and privacy dependency, and a correctness risk — unpkg serves
the LATEST npm release, while we run a vendored fork whose font files carry content hashes
(`dist/prod/fonts/Excalifont/Excalifont-Regular-349fac6c….woff2`); a hash the latest release no longer ships 404s and
the editor silently falls back. The fork's own fonts are already built into
`components/collabboard/canvas/excalidraw_fork/packages/excalidraw/dist/prod/fonts/` by `npm run build:fork`
(`scripts/build-excalidraw-fork.mjs`, wired to `prebuild`; `dist` is gitignored). Sizes: ~600 KB for the Latin fonts,
13 MB for `Xiaolai` (CJK handwriting, loaded only when such characters appear).

## Design
1. **Copy step** `scripts/sync-excalidraw-assets.mjs` (new, plain Node, no dependencies): copies
   `…/packages/excalidraw/dist/prod/fonts/**` to `public/excalidraw-assets/fonts/**` (same relative paths), only
   `.woff2` files, removing stale files in the target first. Exits non-zero with a clear message when the source folder
   is missing ("run npm run build:fork first"). Idempotent.
2. **Wiring**: `build-excalidraw-fork.mjs` runs the copy after a successful fork build (so `prebuild` covers production
   builds); `package.json` gets `"sync:excalidraw-assets": "node scripts/sync-excalidraw-assets.mjs"` and
   `"predev": "npm run sync:excalidraw-assets"` (fast: a file copy, never a fork build).
3. **`.gitignore`**: `public/excalidraw-assets/` (generated, like the fork's `dist`).
4. **`ExcalidrawWrapper.tsx`**: `EXCALIDRAW_ASSET_PATH = `${window.location.origin}/excalidraw-assets/`` (the fork
   appends `fonts/<Family>/<file>`; check `fonts/ExcalidrawFontFace.ts` `getUrls` and match its expected base — the
   resulting URL must be `/excalidraw-assets/fonts/Excalifont/Excalifont-Regular-….woff2`). Keep the existing "only
   if not already set" guard. No other change in the wrapper.
5. The fork's last-resort `ASSETS_FALLBACK_URL` (esm.sh) is NOT changed (fork code); with the first URL working the
   browser never reaches it. Say so in the report.

## Tests
- `sync-excalidraw-assets`: copies nested `.woff2` files into a temp target with the same relative paths; skips other
  files; removes a stale file; missing source → non-zero exit and the message (run against temp dirs, never the real
  `public/`).
- Wrapper: after mount, `window.EXCALIDRAW_ASSET_PATH` is `<origin>/excalidraw-assets/` and contains no `unpkg`; a
  pre-set value is kept.
- A source census: no file under `app/`, `components/` (excluding `excalidraw_fork`), `lib/` contains `unpkg.com`.
- Mutation: put the unpkg URL back → the census test fails.

## Allowed files
```
scripts/sync-excalidraw-assets.mjs (+ test)        new
scripts/build-excalidraw-fork.mjs (+ its contract test, only for the copy call)
package.json                                       the two script lines only
.gitignore                                         one line
components/collabboard/editors/ExcalidrawWrapper.tsx (+ test)
a new census test under lib/infra/ or scripts/
```
Forbidden: everything else, the fork's source, the database.
- Make real tool calls only.
- Run one test file at a time with `--reporter=dot`. Never pipe vitest into grep or head.
- Never compare results with diff or process substitution.
- Revert mutations with your Edit tool.
- No git writes, no production build, no curl of the dev server, do NOT run `npm run build:fork` (it rebuilds the
  fork the running dev server uses) — run only the new copy script, and only against temp dirs in tests. The CTO runs
  the real copy.
- Put `timeout` on every long command.
- Never `cd` into another directory.
- Mark anything you could not verify as "not verified".

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run scripts components/collabboard/editors --reporter=dot
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-286.json
```
Do not commit.

**Live (CTO):** run `npm run sync:excalidraw-assets`; open a drawing editor and type a text (Excalifont): the font
request goes to `localhost:3000/excalidraw-assets/fonts/…` with 200, no request to unpkg.com or esm.sh, text renders in
Excalifont.

## Commit message (verbatim)
```
fix(drawing): serve the drawing editor's fonts from our own app

The drawing editor loaded its fonts from unpkg.com, which also serves the
newest Excalidraw release rather than the version we run. The fonts now
come from the app itself, copied from our own Excalidraw build.
```

## Final result (CTO, 2026-10-05, live)
- `npm run sync:excalidraw-assets`: 234 font files copied to `public/excalidraw-assets/fonts` (14 MB, gitignored).
- New drawing on board af02972f, own tab: `window.EXCALIDRAW_ASSET_PATH` = `http://localhost:3000/excalidraw-assets/`;
  a typed text loads `/excalidraw-assets/fonts/Excalifont/Excalifont-Regular-a88b72a2….woff2` with 200; no request to
  unpkg.com or esm.sh.
- The 4 PATCH-286 test files pass (33 tests). The implementer's full gate ran while PATCH-284 was editing the AI
  editor in parallel; its 43 extra failures are all in `AIComponentEditor.*` files of that concurrent patch and are
  reviewed with PATCH-284.
- Note: `predev` copies the fonts on every `npm run dev`; production builds copy them in `build:fork` (`prebuild`).
