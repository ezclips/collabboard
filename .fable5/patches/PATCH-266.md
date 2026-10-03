# PATCH-266 — Control review (Codex): stability of the AI visualisation feature

Status: AUTHORIZED (owner, 2026-10-03: "There are no pie showing! That whole visualisation function is very buggy! I
want to send a patch to Codex so we can get a second opinion on the stability and recommendations for improvement").
Author: CTO (PM)
Reviewer: **Codex** (independent second opinion — you did not write any of this code)
Branch: `feature/board-retrieval` (all work below is committed and pushed; HEAD includes PATCH-262 `c6a618b0`)
Type: **REVIEW ONLY. Do not change product code.** Your deliverable is a written report.

---

## 1. Why you are being asked

The "Visualize" feature turns a post's text into a picture (diagram, chart, mind map, infographic). It has grown
across ~35 patches (PATCH-230 → PATCH-265) and the owner experiences it as unstable. The latest example
(owner's screenshot, 2026-10-03):

- Generator → Diagram → **Pie Chart** on a post with no numbers ("My fancy padlet-slideshow.pdf", two items:
  the file itself and "watson.ch – The website associated with the file").
- The **"Example numbers"** badge is shown and the info card says "These designs use example numbers".
- The preview and EVERY design tile (Chart pie, Chart pie donut compact / pill / plain …) show the title, connector
  lines and two label cards — but **no pie slices at all**.

A pattern that worries the CTO more than any single bug: in PATCH-260 → PATCH-265 almost every patch passed its
jsdom unit tests and the full gate, and then failed in a real Chrome session, often several rounds in a row (see the
"Addendum" / "Final result" sections of those patch files — each lists the live defects and their root causes). We
want an outside view on whether the design is sound, where it is fragile, and what to change.

## 2. What we want from you

### 2.1 Root cause of the missing pie (concrete, first)
**Update (CTO, 2026-10-03, after this brief was written):** reproduced live — the preview's AntV renderer receives
items with `value: undefined` while the "Example numbers" badge shows. Suspected cause: a PATCH-260 regression in
`AIComponentEditor.tsx` `optionEnvelope` (~L613-617), which replaces every AntV envelope's outline with the raw
`activeOutline` and so drops PATCH-257's `withExampleValues` outline. The fix is being implemented as PATCH-267 (see
`.fable5/patches/PATCH-267.md`). Your job here: **independently confirm or refute** this, and look for other places
where the same kind of "one outline silently replaces another" can happen. Do not stop at this one bug.

Original starting points (hypotheses only — verify, do not trust):
- `components/collabboard/editors/AIComponentEditor.tsx` ~L566-577: `showExampleValues = activeFamily === 'chart'
  && outlineValueCount < 2`; `derivedOutline = withExampleValues(activeOutline)`; `needsExampleEnvelopes`; and which
  outline the main preview and the tiles are actually rendered from (L1615 passes one to the panel — check every
  other consumer).
- `lib/ai/outline.ts` `withExampleValues` (L386) — equal shares summing to 100.
- `lib/ai/antv/mapOutline.ts` L185-186: `datum.value` is only set when `item.value !== undefined`. Check what the
  AntV `chart-pie*` templates need (field name, nesting — top-level items vs children, a hierarchical outline whose
  items sit under a root), and what reaches `toAntvOptions` in this case.
- Is the post's outline hierarchical (a root node with children) so that the pie gets one datum, or zero values?
- Does PATCH-260's `elementOverrides` / PATCH-262's `additions` or the PATCH-264 `kicker` stamping replace the
  outline/envelope on the way to the renderer?
You may confirm with a throwaway Node/vitest script that calls the pure functions (`withExampleValues`,
`suggestDesigns`, `toAntvOptions`) on an outline shaped like the case above — keep it OUT of the repo's test tree
(e.g. in your own temp dir) and say exactly what you ran.

### 2.2 Stability review of the whole feature
Assess, with `file:line` evidence:
1. **Architecture.** Data flow: post text → `/api/ai/generate-outline` (model) → `VisualOutline` → `suggestDesigns`
   → design envelopes → renderers (our own React/SVG renderers AND AntV Infographic, 276 `antv:*` designs) → saved
   post content. Is the single `VisualOutline` the right contract? Where is state duplicated (outline vs envelope vs
   AntV's internal options vs DOM)?
2. **The AntV integration.** We drive AntV's editor ourselves: `options:change` round-trips into our outline
   (`applyAntvChange` in `mapOutline.ts`), we skip `instance.update` for some changes (`lastUpdatedOutlineRef`,
   `lastDrawnRef` in `AntvInfographicRenderer.tsx`), we post-process AntV's SVG (`elementOverrides.ts`,
   `elementColours.ts`, `additions.ts`), and we removed some AntV interactions (`interactions.ts`). Is this
   sustainable across AntV upgrades? What breaks first? Would a different boundary be safer (e.g. treat AntV as a
   pure renderer and own all editing, or the opposite)?
3. **Three overlapping edit layers** on one picture: AntV's own editor (text toolbar, DblClickEditText, ClickSelect,
   SelectHighlight, HotkeyHistory), our element editor (`AntvElementEditor.tsx` + Chrome/ColourMenu/IconPicker/
   AddPanel/useAntvElementDrag), and `PictureEditOverlay.tsx` (mind-map +/− buttons). Plus `PictureStage.tsx`
   (pan/zoom with two modes: AntV viewBox vs CSS transform). Event ownership (capture-phase listeners, pointer
   capture, `data-picture-control`, Escape priority, z-index 9999 vs 10000) — is it coherent or accidental?
4. **Zoom/view model.** `PictureStage` re-fit rules (`atFitRef`, `fit`, resize keep-view from PATCH-265, the
   PATCH-258 write-back after AntV rewrites the viewBox). List every path that can still reset the user's view.
5. **Persistence.** What is saved per post (outline, `elementOverrides`, `additions`, `kicker`, theme, style), how old
   posts migrate, what happens when a design/template changes or AntV renames something. Any data-loss risk?
6. **Testing strategy.** Why do jsdom tests keep passing while Chrome fails? Which classes of behaviour cannot be
   tested in jsdom here (layout, `getBBox`/`getScreenCTM`, pointer capture, CSS that targets svg, AntV rendering)?
   Propose a concrete Playwright E2E harness (what it would cover, how it would get an authenticated session
   WITHOUT using the owner's persistent browser, how to keep it fast and non-flaky).
7. **Code health.** File sizes (`AntvElementEditor.tsx` is 799 lines, `AIComponentEditor.tsx` ~1,700,
   `AIContentEditModal.tsx` ~1,100 — the project ceiling is 800), duplicated logic, dead code from superseded
   patches, debug attributes left in for live checks (`data-ai-last-emit`, `data-ai-outline-overrides`,
   `data-ai-element-key`, …) and whether they should stay.
8. **Performance.** 276 AntV designs, tile thumbnails, lazy loading (PATCH-254), repeated `instance.update`, the
   ResizeObserver, MutationObservers.

### 2.3 Recommendations
- A **ranked list of findings**: CRITICAL / HIGH / MEDIUM / LOW, each with `file:line`, a concrete failure scenario
  (inputs/state → wrong output), and your confidence.
- **Keep / change / replace** verdicts for: the AntV dependency, the element-overrides post-processing layer, the
  three edit layers, PictureStage's two zoom modes, the outline contract.
- A **proposed patch sequence** (titles + one paragraph each, smallest-risk first) we can turn into specs. Include
  the pie fix as patch 1 if you found its cause.
- What you could NOT verify, and what you would need to verify it.

## 3. Where to look

Read the patch specs first — they record the intent and, in their addenda, every live defect and its root cause:
`.fable5/patches/PATCH-230.md` … `PATCH-265.md` (most relevant: 236, 237, 243–245, 248, 250, 252–265).

Main code (line counts as of HEAD):
```
lib/ai/outline.ts                          417   VisualOutline, parseOutline, withExampleValues, suggestDesigns
lib/ai/antv/mapOutline.ts                  705   outline <-> AntV options, applyAntvChange, button/handle mapping
lib/ai/antv/elementOverrides.ts            752   per-element move/resize/hide/colour, keys, sanitizers
lib/ai/antv/additions.ts                   504   added shapes/text/icons
lib/ai/antv/elementColours.ts, icons.ts, viewbox.ts, interactions.ts, catalog.ts (+ catalog.data.ts 1,393)
lib/ai/visualThemes.ts, lib/ai/visualStyle.ts, lib/ai/contracts.ts, lib/ai/validators.ts
app/api/ai/generate-outline/route.ts       317
components/ai/AIContentRenderer.tsx        208   picks the renderer
components/ai/renderers/AntvInfographicRenderer.tsx   ~600
components/ai/renderers/AntvElementEditor.tsx         799  (+ AntvElementChrome, AntvElementColourMenu,
                                                          AntvIconPicker, AntvAddPanel, AntvAddedTextInput,
                                                          useAntvElementDrag, useAntvIconSwap)
components/ai/renderers/PictureStage.tsx              687
components/ai/renderers/PictureEditOverlay.tsx
components/ai/renderers/{MindmapTree,Infographic,Timeline,Comparison,Chart,Code}*Renderer.tsx, DiagramKicker.tsx
components/collabboard/editors/AIComponentEditor.tsx  ~1,700  the generator
components/collabboard/editors/OutlineSuggestionsPanel.tsx    the docked designs/edit/colours/add panels
components/ai/editors/AIContentEditModal.tsx           ~1,100  the Edit window
node_modules/@antv/infographic/esm/editor/**   AntV's editor (interactions, managers, plugins)
```

## 4. Live inspection of the real page (owner's instruction: "go to the page as well")

The owner wants you to see the feature running, not only read it. The page is the owner's real board:
**http://localhost:3000/dashboard/canvas/af02972f-dfde-4545-9fc8-5fcbccb007c3** (dev server already running on :3000).

### 4.1 How to get there (the only allowed way)
The owner's Chromium is already running and logged in, with remote debugging on **http://127.0.0.1:9333**. Attach to
it with the repo's Playwright, open ONE new tab of your own, and lock that tab against writes BEFORE navigating:

```js
// run with: node <your-temp-dir>/inspect.mjs   (script lives in YOUR temp dir, never in the repo)
const pw = await import('file:///C:/Users/rmeic/Projects/dev/starter/node_modules/playwright/index.js');
const chromium = pw.chromium ?? pw.default?.chromium;
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const page = await browser.contexts()[0].newPage();          // YOUR tab — the only one you may touch
const blocked = [];
// WRITE LOCK: every non-GET request is aborted, except the outline call that draws previews.
await page.route('**/*', (route) => {
  const req = route.request();
  const method = req.method();
  const url = req.url();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return route.continue();
  if (method === 'POST' && /\/api\/ai\/generate-outline(\?|$)/.test(url)) return route.continue();
  blocked.push(method + ' ' + url.replace(/\?.*$/, ''));
  return route.abort();
});
try {
  await page.setViewportSize({ width: 1460, height: 850 });
  await page.goto('http://localhost:3000/dashboard/canvas/af02972f-dfde-4545-9fc8-5fcbccb007c3',
    { waitUntil: 'domcontentloaded', timeout: 240000 });
  // ... your read-only inspection ...
} finally {
  console.log('blocked writes:', blocked);
  // Expected (CTO test run, 2026-10-03): "PATCH /rest/v1/boards" (the board's own "last visited" stamp on load) and
  // "POST /__nextjs_original-stack-frames" (Next's dev error overlay symbolicating the console error the app logs
  // BECAUSE the lock blocked that "last visited" update -- "Error updating last_visited_at: Failed to fetch"; the
  // red "1 Issue" badge comes from it too, so it is caused by the lock, not an app bug). Report any OTHER console
  // error. Anything else in `blocked` means you clicked something that persists: stop.
  await page.close();                          // close ONLY your tab
  process.exit(0);                             // NEVER browser.close()
}
```

### 4.2 What you may do on the page
- Look: screenshots (saved in YOUR temp dir), DOM inspection, `page.evaluate` reads, console messages.
- Open the **AI component generator** from the left toolbar (`[data-toolbar-tool="ai-component"]`), type your OWN short
  test text, choose Diagram → Show options / Pie Chart / Bar Chart / Mindmap / Timeline / Comparison, click designs,
  zoom, open the side panels, select/move/recolour elements in the PREVIEW, and then **Cancel**.
- Reproduce the owner's case: on the post **"My fancy padlet-slideshow.pdf"** open its generator (the pen / regenerate
  action on the post), choose **Pie Chart**, observe, then **Cancel**.
- At most **8 generate calls** in total (each one is a real, billed AI call). Log how many you made.

### 4.3 What you must NOT do on the page (strict)
- **Never press "Save to Canvas", "Save", "Make pie chart" … any button that persists or spends credits beyond the
  8 previews.** The write lock is a safety net, not permission: if `blocked` lists anything other than the two
  expected entries in 4.1, stop and report what you clicked. (Verified by the CTO: with this lock the generator still
  draws its previews — 52 designs — and nothing is written.)
- Never create, edit, move, resize, delete, duplicate, comment on or react to any post; never open a post's context
  menu; never change board settings, members, sharing, wallpaper or layout; never use the Board AI chat.
- Never touch, focus, reload, navigate or close **any other tab** (the owner is working in them). Never call
  `browser.close()`, never relaunch Chromium, never log in or out, never clear cookies/storage.
- Do not interact with the opencode server on port 4096 or with the dev server process (no restarts, no kills).
- Do not read or print cookies, `localStorage` auth entries, tokens or headers.

## 5. Rules (hard) — this is a review, not an implementation

- **You do not write code.** No edits to ANY file in the repo except creating the report in section 6. Not a
  one-line fix, not a test, not a comment, not a config or lockfile. If you know the fix, DESCRIBE it in the report
  (file, line, the change in prose or a short snippet inside the report) — do not apply it.
- **No git writes** of any kind (commit, add, branch, stash, reset, restore, clean, checkout, push).
- **No installs** (`npm`/`npx` installing packages), no changes to `package.json`, `.env*`, `next.config.ts`,
  `.claude/`, `.opencode/`, `.agent/`.
- **No production build** (`next build`) — a dev server is running and shares `.next`. Do not start a second server.
- **No database access** (no Supabase calls, no SQL, no migrations) and **no AI provider calls** other than the ≤ 8
  preview generations through the page in section 4.
- **Never print or copy secrets**: no keys, tokens, passwords, cookies or Authorization headers anywhere; `.env*`
  files are off limits.
- Allowed commands: reading files; `npx tsc --noEmit`; `npx vitest run <one file> --reporter=dot` (the full suite takes
  ~10 min and has 59 known unrelated failures — see `.agent/verification-baselines.md`; do not run it); the page
  inspection script of section 4; throwaway scripts in YOUR temp dir that import pure functions.
- Do not trust the patch files' claims blindly — they were written by the same team. Verify against the code and the
  live page.
- If anything is unclear or a rule would block an important check, **stop and write the question in the report**
  instead of working around the rule.

## 6. Deliverable

Write **`.fable5/reviews/REVIEW-266-visualisation-stability.md`** (create the folder — the ONLY file you create) with:
1. Summary (≤ 10 lines): overall verdict on stability, the top 3 risks.
2. The missing-pie root cause, with evidence (live observation + code) and the minimal fix you recommend.
2b. Live session log: what you did on the page step by step, what you saw (describe screenshots), console errors,
    the number of generate calls, and the final `blocked writes` list.
3. Findings table (severity, area, `file:line`, failure scenario, confidence).
4. Keep / change / replace verdicts (section 2.3).
5. Proposed patch sequence.
6. Proposed E2E test plan.
7. What you could not verify.
Then reply with a short summary and the path of the report.
