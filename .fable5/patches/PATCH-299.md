# PATCH-299 — "Browse libraries" opens the real Excalidraw library site, and a library added there arrives

Status: AUTHORIZED (owner, 2026-10-06: screenshot of "Failed to load canvas" at `/dashboard/canvas/undefined?target=…`,
"there is an error"; PM decision: make the link work instead of hiding it a second time).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`

## Facts (CTO, live + source, 2026-10-06)
1. The owner's tab `http://localhost:3000/dashboard/canvas/undefined?target=_blank&referrer=…%2Fdashboard%2Fcanvas%2Faf02972f-…&useHash=true&token=…&theme=light&version=2`
   was opened at 15:23Z today by a board page (`window.opener` set) — after PATCH-291 (09:41 local) hid the link.
   The route id `undefined` makes every query `id=eq.undefined` → 400 → "Failed to load canvas".
2. The address is built by Excalidraw's `LibraryMenuBrowseButton.tsx`:
   `` `${import.meta.env.VITE_APP_LIBRARY_URL}?target=…` ``. The fork's build bakes an env object with only `DEV`
   (`dist/dev/chunk-*.js`), so the base is the string `undefined`, resolved relative to `/dashboard/canvas/`.
3. PATCH-291 hides the link with `[data-library-button] .library-menu-browse-button { display: none; }` inside
   `ExcalidrawWrapper.tsx`. Excalidraw's own `.excalidraw .library-menu-browse-button { display: flex }` has the SAME
   specificity, so which one wins depends on stylesheet order. The CTO's two live checks (Drawing canvas 0c65aa8e,
   new drawing post on af02972f) showed `display: none`, yet the owner clicked the link — a hide that depends on load
   order is not a fix.
4. `https://libraries.excalidraw.com` answers library files with `Access-Control-Allow-Origin: *`. A file is JSON
   `{ "type": "excalidrawlib", "version": 1, "library": [ [element, …], … ] }` (version 2 uses
   `"libraryItems": [ { "id", "status", "name"?, "elements": [ … ] } ]`). After "Add to Excalidraw" the site opens
   `<referrer>#addLibrary=<encoded file URL>&token=<id>` (because `useHash=true`) in a new tab.
5. The user's own library is `lib/collabboard/excalidrawLibrary.ts` (table `excalidraw_library`, RLS per user,
   **primary key `id` alone, text**). Both drawing surfaces already show its items (`DrawingLayout.tsx` L2133,
   `DrawingEditor.tsx` L248 via `getExcalidrawLibrary()`). `addToExcalidrawLibrary` logs and swallows save errors.
6. "Publish library" is already removed in this fork (`LibraryMenuHeaderContent.tsx` L223) — out of scope.

## Design
1. **Real address.** `LibraryMenuBrowseButton.tsx` (fork): base =
   `import.meta.env.VITE_APP_LIBRARY_URL || "https://libraries.excalidraw.com"` (a named constant in the same file).
   Nothing else in the fork changes. The CTO rebuilds the fork (`npm run build:fork`); the coder does not build.
2. **Show the link again.** `ExcalidrawWrapper.tsx`: delete the `.library-menu-browse-button { display: none; }` line
   and update the PATCH-291 comment above it (one line). The `default-sidebar-trigger` rule stays.
3. **Pure parsing — `lib/domain/canvas/excalidrawLibraryReturn.ts` (new, no browser or network APIs):**
   - `parseLibraryReturn(hash: string): { libraryUrl: string } | null` — reads `addLibrary` from the hash
     (`URLSearchParams(hash.replace(/^#/, ''))`). Accept only `https:` URLs whose hostname is exactly
     `libraries.excalidraw.com` and whose pathname ends with `.excalidrawlib`; anything else → `null`.
   - `hashWithoutLibraryReturn(hash: string): string` — the hash with `addLibrary` and `token` removed, other keys
     kept; `''` when nothing is left.
   - `parseLibraryFile(text: string, libraryUrl: string)` →
     `{ ok: true; items: { name: string; elements: unknown[] }[] } | { ok: false; reason: string }`.
     Text longer than 5,000,000 characters → `"The library file is too large."`. Not JSON / no `library` or
     `libraryItems` array → `"This is not an Excalidraw library file."`. Version 1: each inner array is an item.
     Version 2: each `libraryItems[i].elements`. Skip items whose `elements` is empty or not an array, and items that
     contain an element of type `image`, `embeddable` or `iframe` (they need files or load outside pages). More than
     500 items → keep the first 500. Zero items left → `"The library has no items this app can use."`.
     Item names: v2 `name` when it is a non-empty string, else `<Library name> <n>` where `<Library name>` is the file
     name from the URL without `.excalidrawlib`, dashes/underscores → spaces, first letter capital (`r.excalidrawlib`
     → `R 1`, `R 2`; `aws-architecture-icons.excalidrawlib` → `Aws architecture icons 1`).
4. **Saving — `lib/collabboard/excalidrawLibrary.ts`:** new
   `addItemsToExcalidrawLibrary(items: ExcalidrawLibraryItem[]): Promise<{ saved: number; error: string | null }>` —
   ONE `upsert` of all rows for the signed-in user (not signed in → local cache only, `saved = items.length`,
   `error: null`, as today), local cache updated first, the database error RETURNED (message only), never swallowed.
   Existing functions unchanged.
5. **The return — `components/collabboard/useExcalidrawLibraryReturn.ts` (new client hook, ≤ 120 lines):**
   runs once on mount. `parseLibraryReturn(window.location.hash)`; `null` → nothing. Otherwise:
   1. immediately `history.replaceState(null, '', pathname + search + newHash)` with
      `hashWithoutLibraryReturn` (a reload never adds the library twice);
   2. `fetch(libraryUrl, { credentials: 'omit', signal })` with a 15 s abort; `!res.ok` → error;
   3. `parseLibraryFile`; failure → error with its reason;
   4. `await fetchExcalidrawLibrary()`; drop items whose `source` (`${libraryUrl}#${index}`, index = position in the
      parsed list) is already present; none left → `toast.info('This library is already in your library.')`;
   5. build items with `id: crypto.randomUUID()` (the table's key is global, so file ids must not be reused),
      `name`, `elements`, `source` as above, `created: Date.now()`; `addItemsToExcalidrawLibrary`;
   6. success → `toast.success('Added N items to your library. Open the library in a drawing to use them.')`
      (`1 item` singular); any error → `toast.error('Could not add the library: <reason>')`.
   No other side effects; unmount aborts the fetch.
6. **Mount.** `app/dashboard/canvas/[id]/CanvasClient.tsx`: import + one call `useExcalidrawLibraryReturn();` at
   the top level of the component (net ≤ +2 lines; the file is over the ceiling).

## Tests
- `excalidrawLibraryReturn.test.ts` (new, lib/domain): accepts the real-site URL; rejects `http:`, another host
  (`libraries.excalidraw.com.evil.test`, `evil.test`), a non-`.excalidrawlib` path, a missing key, a malformed URL;
  `hashWithoutLibraryReturn` keeps other keys and returns `''` when empty; v1 and v2 files parse; empty items, image /
  embeddable / iframe items skipped; 501 items → 500; > 5,000,000 chars, non-JSON and missing arrays give the exact
  reasons above; names (`R 1`, v2 name, the dashed example).
- `excalidrawLibrary` test for `addItemsToExcalidrawLibrary`: one upsert with every row and `user_id`; a database
  error is returned, not thrown or swallowed; not signed in → no upsert, cache updated.
- `useExcalidrawLibraryReturn.test.tsx` (new, next to the hook): no hash → no fetch; a valid hash → the hash is
  removed before the fetch resolves, one save with fresh ids and `source` keys, success toast with the count;
  duplicates → info toast, no save; fetch failure / bad file / save error → one error toast; a disallowed URL → no
  fetch.
- Fork source test (new, `components/collabboard/` level): `LibraryMenuBrowseButton.tsx` contains
  `https://libraries.excalidraw.com` and no longer starts the href with the bare env value.
- `ExcalidrawWrapper.libraryButton.test.tsx`: the "hides the dead Browse-libraries link" test becomes "does not hide
  the Browse-libraries link" (no `.library-menu-browse-button` rule); the toolbar-trigger tests stay.
- Mutation: allow any host in `parseLibraryReturn` → the host tests fail; revert with the Edit tool.

## Allowed files
```
components/collabboard/canvas/excalidraw_fork/packages/excalidraw/components/LibraryMenuBrowseButton.tsx
components/collabboard/editors/ExcalidrawWrapper.tsx                (+ its libraryButton test)
lib/domain/canvas/excalidrawLibraryReturn.ts                        (+ test)   new
lib/collabboard/excalidrawLibrary.ts                                (+ test)
components/collabboard/useExcalidrawLibraryReturn.ts                (+ test)   new
app/dashboard/canvas/[id]/CanvasClient.tsx                          import + one call, net <= +2
one new fork source test under components/collabboard/
```
Forbidden: everything else, other fork files, `.env*` files, the database, `npm run build:fork`.
- Make real tool calls only.
- Run one test file at a time with `--reporter=dot`. Never pipe vitest into grep or head.
- Never compare results with diff or process substitution.
- Revert mutations with your Edit tool.
- No git writes, no production build, no curl of the dev server or of excalidraw.com, no browser.
- Put `timeout` on every long command.
- Never `cd` into another directory.
- Mark anything you could not verify as "not verified".

## Verification
```
timeout 600 npx tsc --noEmit
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-299.json
```
Do not commit.

**Live (CTO):** rebuild the fork; in a drawing's library the "Browse libraries" link points at
`https://libraries.excalidraw.com/?target=…`; a board opened with `#addLibrary=<a real small library>&token=x` shows
the success toast, the hash is gone, the items appear in the drawing library, a reload adds nothing; a disallowed
host does nothing; the CTO deletes the test items afterwards.

## Commit message (verbatim)
```
fix(drawing): Browse libraries opens the Excalidraw library site

The link pointed at "undefined", which opened a broken board page. It
now opens libraries.excalidraw.com, and a library added there is saved
to your own library and shows up in every drawing.
```

## Addendum 1 (CTO review, 2026-10-06)
Gate `.opencode-vitest-299.json`: 26 failing files, identical by name to 298a; tsc clean. Two defects:
1. **Strict Mode drops the import.** `next.config.ts` does not set `reactStrictMode`, so the App Router default (on)
   applies: in dev the effect runs, its cleanup runs, and it runs again. Run 1 strips the hash and starts the fetch;
   cleanup ABORTS it; run 2 finds no hash → nothing is added and no toast. Fix: the cleanup must not abort the
   download (keep the 15 s timeout abort only). Test: mount, unmount immediately, then let the fetch resolve → the save
   and the success toast still happen; and a second mount after the hash is stripped does not fetch again (one fetch
   in total).
2. **A failed save looks saved.** `addItemsToExcalidrawLibrary` puts the items in the local cache BEFORE the upsert,
   so after a database error they still show in the drawing library and a retry says "already in your library".
   Fix: signed in → update the local cache only after the upsert succeeded; not signed in → cache as now. Test: a
   database error leaves the cache unchanged.
Allowed files: `components/collabboard/useExcalidrawLibraryReturn.ts`, `lib/collabboard/excalidrawLibrary.ts` and their
tests. Same rules. Gate `--outputFile=.opencode-vitest-299a.json`.

## Addendum 2 (CTO live, 2026-10-06)
Live (kit, own tab, test rows deleted after): the return works — first visit "Added 2 items to your library…", the hash
is gone, ONE upsert; second visit "This library is already in your library.", no upsert; `evil.test` → nothing, no
request. The Browse link is visible with `href` `https://libraries.excalidraw.com?target=_blank…`.
**Defect (pre-existing, now visible):** in a drawing post the "Personal Library" shows every personal item TWICE
(local cache holds 2 items; the sidebar shows R, R, R, R). Cause: the personal items are fed to Excalidraw on two
paths — `initialData.libraryItems` (Excalidraw merges it asynchronously in `App.tsx` ~L2820 with `merge: true`) AND
`api.updateLibrary({ …, merge: false })`. When the async merge lands after the replace, its de-duplication (element
`id` + `versionNonce`, `data/library.ts` `isUniqueItem`) does not recognise the restored copies, so they are added again.
`DrawingEditor.tsx` (L248–265, L750) and `DrawingLayout.tsx` (L2133–2146, L3742) both do this.
**Fix — one path only:** remove `libraryItems` from the `initialData` passed to Excalidraw in both files (and from the
`useMemo` dependency list in `DrawingLayout.tsx`); the list reaches the editor only through
`updateLibrary({ libraryItems: merged, merge: false })`, called whenever the API is available AND whenever the list
changes (community items immediately, again after the AntV items arrive). In `DrawingEditor.tsx` make sure a list
that is ready before the API is pushed when the API arrives (today the AntV push is lost if `excalidrawAPIRef` is
still null). Both files are over the ceiling: net growth ≤ 0 in `DrawingLayout.tsx`, ≤ +6 in `DrawingEditor.tsx`.
Tests: the `initialData` given to Excalidraw has no `libraryItems` (both surfaces; source tests are acceptable where
rendering is impractical — `vitest.config.ts` does NOT run `components/collabboard/canvas/layouts/*.test.*`, so put a
DrawingLayout test at `components/collabboard/*.test.tsx` level); DrawingEditor: a list ready before the API is pushed
once the API arrives, with `merge: false`.
Allowed files: `components/collabboard/editors/DrawingEditor.tsx`, `components/collabboard/canvas/layouts/DrawingLayout.tsx`,
new/edited tests. Same rules. Gate `--outputFile=.opencode-vitest-299b.json`.

## Final result (CTO, 2026-10-06, live after `npm run build:fork`)
Gate `.opencode-vitest-299b.json`: 26 failing files, identical by name to 298a; tsc clean. Live (kit, own tab, every
test row deleted through the REST API and removed from the local cache): the Browse link is visible and points at
`https://libraries.excalidraw.com?target=_blank…`; a return with `#addLibrary=<R Icons>` shows "Added 2 items to
your library…", strips the hash and makes one upsert; the same return again shows "This library is already in your
library." with no upsert; an `evil.test` URL does nothing and is never requested. After Addendum 2 the "Personal
Library" shows R, R once — drawing post on af02972f (258 units = 256 + 2) and the Drawing canvas 0c65aa8e.
Line counts: CanvasClient +2, DrawingLayout −14, DrawingEditor +5. Open (not this patch): on the Drawing canvas the
Board AI and wiki buttons cover the library sidebar's top-right controls (the "⋮" menu and close).
