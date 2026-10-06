# PATCH-290 — Live-check kit and a guard hook for the owner's browser

Status: AUTHORIZED (owner, 2026-10-06: "Shall I write the hook and the live-check kit as PATCH-290? … yes").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`

## Why
Every patch's live check is a new ~100-line hand-written Playwright script against the owner's own browser (CDP
9333). Two failures this week came from that: a page-size lock (`setViewportSize` / `setDeviceMetricsOverride`)
that outlives its connection and survived on the owner's board tab (LESSONS_LEARNED 2026-10-05), and fixed
`waitForTimeout` pauses that make checks slow and flaky. The rules in TESTING.md §4 are written down but nothing
enforces them. Idea taken from ECC (github.com/affaan-m/ECC): deterministic PreToolUse hooks, and stable
wait-for-condition E2E helpers — built for our setup, not installed from there.

## Design

### 1. Guard hook `scripts/hooks/guard-live-browser.mjs` (new, ESM, no dependencies)
A Claude Code PreToolUse command hook. Reads the hook JSON from stdin (`tool_name`, `tool_input`, `cwd`), decides,
and exits `2` with a one-paragraph reason on stderr to block, `0` to allow. Its own errors (bad JSON, unreadable
file) never block: exit 0 with a stderr warning.
Pure core `decide(input, { readFile })` → `{ block: false } | { block: true, reason }` (exported for tests); the CLI
part only wires stdin/stdout/exit.
- **Browser script** = text that mentions `9333` or `connectOverCDP` or imports `scripts/live/kit`.
- **Forbidden in a browser script:** `setViewportSize(`, `setViewport(`, `setDeviceMetricsOverride`,
  `browser.close(`, `context.close(`, `browser.contexts()[0].close(`. Exception: a file containing the exact comment
  `// live-guard: unlock-recipe` may use `setDeviceMetricsOverride` (the documented unlock recipe) — nothing else.
- `Bash` / `PowerShell`: block when the command
  - contains `next build` or `npm run build` (word-bounded; `npm run build:fork` and `sync:` scripts are allowed)
    → reason: "No production build while the dev server runs (owner rule)";
  - runs `node` on a `.mjs/.cjs/.js` file (relative paths resolved against `cwd`; also `timeout N node file`): read
    the file; block if it is a browser script with a forbidden pattern;
  - contains `node -e`/`node --eval` inline text that is a browser script with a forbidden pattern.
- `Write`: block when `content` is a browser script with a forbidden pattern. `Edit`: block when `new_string` has a
  forbidden pattern and the target file (read from disk) or `new_string` is a browser script.
- Reasons name the pattern and point to TESTING.md §4 ("Live checks in the owner's browser").

### 2. Live-check kit `scripts/live/kit.mjs` (new, ESM) + `scripts/live/README.md`
Built on Playwright's `chromium.connectOverCDP('http://127.0.0.1:9333', { timeout: 180000 })`.
- `runLive(name, async (ctx) => { … })` — attach, open ONE own tab (`newPage()`), install the write-lock, run the
  body, and ALWAYS in `finally`: close the own tab, run `checkOwnerTabs()`, print a summary (blocked writes, page
  errors without browser-extension noise, tab check), then `process.exit(code)` (0 ok, 1 when the body threw or a tab
  check failed). Never closes the browser or a context, never sets a page size.
- `ctx` = `{ page, net, log, allowWrites(fn) }`:
  - write-lock: `page.route('**/*')` lets `GET/HEAD/OPTIONS` through and aborts every other method, recording it;
    `allowWrites(fn)` opens the lock only while `fn` runs (also on throw).
  - `net`: every non-GET response to `/rest/v1/padlets` as `{ method, status, url, id, requestBody }`.
- Board helpers (all wait for conditions, no fixed sleeps except a ≤ 300 ms settle where an animation is unavoidable):
  - `openBoard(ctx, boardId)` → goto + wait for `[data-board-wiki-open="true"]` (attached) and at least one
    `[data-padlet-id]`.
  - `openNewDraw(ctx)` → right-click a list of empty-canvas candidate points until the "New Draw" menu item
    appears, click it, wait for `.excalidraw`.
  - `openLibrary(ctx)` / `closeLibrary(ctx)` (`.excalidraw .sidebar-trigger`, wait for/until `.library-unit`).
  - `insertLibraryItem(ctx, index)`.
  - `saveDrawing(ctx)` → inside `allowWrites`, click "Save Changes", wait for the padlets POST response; returns
    `{ status, id, elements }` (`elements` parsed from the request body's `metadata.drawingData`, non-deleted).
  - `deletePost(ctx, id)` → the board context menu "Delete" (same approach as the CTO's scratch delete script:
    dispatch `contextmenu` on the card, click the `Delete` menu item, confirm if a dialog asks), inside
    `allowWrites`; waits for the DELETE response; returns its status.
- `checkOwnerTabs()` (raw CDP, no Playwright): `GET /json/list`, for every `page` target evaluate
  `innerWidth/outerWidth/innerHeight/outerHeight` over its websocket; returns rows; a row whose `innerWidth !==
  outerWidth` is reported as LOCKED with the unlock hint (TESTING.md §4). Pure `lockedTabs(rows)` exported for tests.
- Pure helpers exported for tests: `isReadMethod(method)`, `padletIdFromBody(text)`, `drawingElementsFromBody(text)`,
  `isExtensionNoise(message)` (the "A listener indicated an asynchronous response…" message).
- README: a 20-line example (insert a library chart, save, assert, delete) and the rules.

### 3. Docs
TESTING.md §4: "Use `scripts/live/kit.mjs` for every live check" and "the guard hook enforces the rules; enable it
locally in `.claude/settings.local.json` (the CTO does this; never in `settings.json`)".

## Tests (TDD)
- hook `decide`: each forbidden pattern blocks in a browser script (Write content, Edit new_string, `node file`,
  `timeout 600 node file`, `node -e`); the same text WITHOUT 9333/connectOverCDP is allowed; the unlock-recipe
  comment allows `setDeviceMetricsOverride` but not `setViewportSize`; `npm run build` / `npx next build` blocked,
  `npm run build:fork` / `npm run sync:excalidraw-assets` / `npx vitest` allowed; unreadable file / bad JSON → allow;
  a PowerShell command is treated like Bash.
- hook CLI: spawn it with a blocking JSON on stdin → exit 2 and the reason on stderr; allowing JSON → exit 0.
- kit pure helpers: `isReadMethod`, `padletIdFromBody`, `drawingElementsFromBody` (filters deleted, survives junk →
  `[]`), `lockedTabs`, `isExtensionNoise`.
- Source test: `scripts/live/kit.mjs` contains none of the forbidden patterns and no `waitForTimeout(` above 300.
- vitest must include `scripts/hooks/**/*.test.*` and `scripts/live/**/*.test.*` (add the include lines with the
  usual "silently NOT RUN" comment if they are not covered).

## Allowed files
```
scripts/hooks/guard-live-browser.mjs (+ test)          new
scripts/live/kit.mjs, scripts/live/README.md (+ test)  new
vitest.config.ts                                       include lines only
.fable5/docs/TESTING.md                                §4 lines only
```
Forbidden: everything else, `.claude/**`, the database, the browser.
- Make real tool calls only.
- Run one test file at a time with `--reporter=dot`. Never pipe vitest into grep or head.
- Never compare results with diff or process substitution.
- Revert mutations with your Edit tool.
- No git writes, no production build, no curl of the dev server, no browser, no CDP connection.
- Put `timeout` on every long command.
- Never `cd` into another directory.
- Mark anything you could not verify as "not verified".

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run scripts/hooks scripts/live --reporter=dot
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-290.json
```
Do not commit.

**Live (CTO):** enable the hook in `.claude/settings.local.json`; a scratch script with `setViewportSize` + 9333 is
blocked on Write and on `node`; the unlock recipe still runs; `npm run build` is blocked. Port the PATCH-288 live
check to the kit (insert, save, widen, reload, delete) and run it: own tab only, owner tabs reported unlocked,
process exits.

## Commit message (verbatim)
```
chore(tooling): live-check kit and a guard hook for the shared browser

Live checks now use one kit that opens its own tab, blocks writes except
during a save, waits for the page instead of sleeping, and checks the
owner's tabs afterwards. A Claude Code hook blocks scripts that would
change a tab's page size or close the shared browser, and production
builds while the dev server runs.
```

## Addendum 1 (CTO, 2026-10-06, hook tried with real command shapes)
Blocks correctly: `npm run build`, `npx next build` (PowerShell too), `browser.close(` in a Write, a script given
by its Windows path or relative to `cwd`; allows `npm run build:fork`, bad JSON. **Two gaps — the CTO's everyday
command shapes slip through (fail-open):**
1. `cd "<dir>" && timeout 600 node script.mjs 2>&1 | grep -v x` — the file is resolved against `cwd`, ignoring the
   `cd`. Fix: split the command on `&&`, `;`, `||` and newlines; track the directory of the last `cd <dir>` /
   `cd "<dir>"` / `Set-Location <dir>` before each `node` invocation (relative to the previous one, starting at
   `cwd`); strip pipes and redirections after the file argument.
2. Git-Bash drive paths: `/c/Windows/...` (file argument, `cd` target, or `cwd`) → `C:/Windows/...`. Also accept
   `C:\...` and `C:/...`.
Tests: both shapes above block a forbidden script and allow a clean one; `cd` into a relative subfolder; a
PowerShell `Set-Location 'C:\x'; node y.mjs`. Gate `--outputFile=.opencode-vitest-290a.json`, compare with 289.

## Addendum 2 (CTO, 2026-10-06, kit run live)
The PATCH-288 check ported to the kit (`openBoard` → `openNewDraw` → `openLibrary` → `insertLibraryItem` →
`closeLibrary` → `saveDrawing`) ran in the owner's browser: own tab only, tab check clean (6 tabs, 0 locked), exit
paths fine, `deletePost` returned 204. Defects:
1. **`saveDrawing` returns `id: null, elements: []` on a 201.** The id is in the RESPONSE body (PostgREST returns the
   inserted row), not the request; and the request body is a JSON ARRAY of rows whose `metadata.drawingData` is a JSON
   STRING. Fix: `id` from `await response.text()` via `padletIdFromBody`; `elements` from the request body: parse, take
   `body[0]` when it is an array, `JSON.parse(row.metadata.drawingData)`, drop `isDeleted`. Extend
   `drawingElementsFromBody` tests with exactly that shape (array + string `drawingData`). The orphaned post this
   caused was found by `created_at` and deleted by the CTO.
2. **`closeLibrary` cost ~30 s:** inserting a library item already closes the sidebar, so `closeLibrary` clicked the
   trigger (re-opening it) and then waited 30 s for `hidden`. Fix: only click when a `.library-unit` is visible, and
   wait at most 5 s.
3. **`openNewDraw` took ~20 s.** Accept the menu item by role `menuitem` OR by exact text "New Draw" (the CTO's
   working scripts used `getByText('New Draw', { exact: true })`), and give each point 800 ms.
4. Add `ctx.timing(label)` that logs seconds since the body started — the summary should show where time went.
Tests for 1 and the pure parts of 2/3 where possible. Gate `--outputFile=.opencode-vitest-290b.json`.

## Addendum 3 (CTO, 2026-10-06, hook live)
Enabled in `.claude/settings.local.json`: writing a forbidden browser script and running one (`cd … && node …`) were
both refused with the TESTING.md pointer. Edge case accepted: Git-Bash's `/tmp/...` alias for the Windows temp folder
is not resolved (fail-open) — scripts are run by `C:/` or `/c/` paths.
**False positive:** a Bash heredoc that only WRITES text mentioning the production-build command (a memory note,
then this addendum) was blocked. Fix: the build rule matches only when the build command is the command actually run
in a segment — at the start of a segment (after optional `timeout N`, `npx`, env assignments like `FOO=1`), not
inside a heredoc body, a quoted string argument, an `echo` / `printf` / `cat <<` payload or a `grep` pattern. Tests:
a heredoc containing the text → allowed; `echo "npm run build"` → allowed; `grep -n "next build" file` → allowed;
`cd x && npm run build` and `timeout 900 npx next build` → blocked; PowerShell `npm run build` → blocked.
Gate `--outputFile=.opencode-vitest-290c.json`.

## Addendum 4 (CTO, 2026-10-06, kit rerun live)
After Addendum 2 the PATCH-288 check runs in 17.7 s (was ~60 s): board 4.2 s, New Draw 8.3 s, insert 9.8 s, save
201 with the id, widen 125 → 445 px (PATCH 204), same width after reload, delete 204; 7 owner tabs, 0 locked.
**One defect left:** `saveDrawing().elements` is `[]`. `metadata.drawingData` holds the element ARRAY itself (a JSON
string of `[...]`), not `{ elements: [...] }`. Fix `drawingElementsFromBody`: after parsing, accept an array as the
elements, or an object's `elements`. Test with the real shape (array row, string `drawingData` of an array).
Gate `--outputFile=.opencode-vitest-290d.json`.

## Final result (CTO, 2026-10-06, live)
- Hook enabled in `.claude/settings.local.json` (owner-approved, local only, together with a 41-entry deny list and
  ask-first mode). Live: writing a forbidden browser script → refused; running one via `cd … && node …` → refused;
  a note that only mentions the build command → allowed; unlock recipe → allowed.
- Kit live (PATCH-288 check ported, `scratchpad/kit288.mjs`): board 3.5 s, New Draw 7.8 s, insert 9.2 s, save 201
  with id and 38 elements, widen 125 → 445 px (PATCH 204), kept after reload, delete 204 — 16.3 s in all (the
  hand-written version took ~60 s). Own tab only; 7 owner tabs checked, 0 locked; exits cleanly.
- AgentShield 1.6.0 (offline scan, code reviewed first) on the project `.claude`: B/80; local settings down to 3
  minor findings; the rest are stale one-off allows in the tracked `settings.json`.
- Gate `.opencode-vitest-290d.json`: 59/59 identical to 289 by name; tsc clean; +81 tests (62 hook, 19 kit).
