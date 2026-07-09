# CanvasClient Site Map — the strangler program's inheritance document

**Status:** living document. Measured at commit `e04700d`, 2026-07-09, by the
sitting CTO (Fable). Line numbers are valid at that commit ONLY — regenerate
(§6) before using them after any change to the measured files.

**Purpose:** `app/dashboard/canvas/[id]/CanvasClient.tsx` (8,526 lines) is the
monolith the whole strangler program exists to dismantle (batches 026+ in
CURRENT_TASK). The sitting CTO's window closes 2026-07-12; whoever designs
those batches inherits THIS map instead of re-deriving it. It records what a
grep census alone gets wrong, which numbers were previously recorded wrong,
and how to regenerate everything mechanically.

## 1. The headline census (measured, not asserted)

`CanvasClient.tsx` in-file supabase call sites — **73 total `.from(` calls**:

| Surface | Count | Operations |
|---|---|---|
| `padlets` table | **61** | 33 update · 19 insert · 8 delete · 1 select |
| `board_sections` table | 6 | 4 update · 1 insert · 1 delete |
| `boards` table | 4 | 4 update |
| storage bucket `padlet-files` | 2 | 1 upload · 1 getPublicUrl (one function, L3730/L3737) |
| `supabase.auth` | 3 | `updateUser` L263 · `getUser` L279 · `onAuthStateChange` L296 |

**Census correction:** earlier planning docs recorded "60 padlets sites". The
real count is **61** — site L2652 is written `.from("padlets")` with DOUBLE
quotes while the other 60 use single quotes. Any grep on `'padlets'` alone
undercounts by one. Every pattern in this program must cover both quote
styles: `\.from\(['\"]padlets['\"]\)`.

## 2. What the in-file census CANNOT see (read this before designing 026+)

1. **The reads live in hooks, not in CanvasClient.** The component's own 61
   padlets sites are almost all WRITES (the single select at L7069 is a
   read-modify-write on a child's metadata inside a comment handler). Initial
   board data loads through `components/collabboard/canvas/hooks/`:
   - `useCanvasData.ts` (633 lines): **21 sites** — 12 padlets, 5
     canvas_lines, 2 board_sections, 1 boards
   - `useCanvasInteractions.ts`: 4 padlets sites
   - `useCanvasLines.ts`: 1 canvas_lines site
   These files are NOT on the grandfather list and NOT caught by the boundary
   lint — they import `supabaseBrowser` from `@/lib/supabase/browser`, which
   the lint does not ban (the PATCH-022 proxy-metric trap). The strangler is
   not done when CanvasClient is clean; it is done when the hooks are too.
2. **`canvas_lines` is a live sixth table** (6 sites across two hooks) that
   appeared in NO earlier census — earlier counts only looked at the monolith
   file. Drawing lines persist there.
3. **CanvasClient's `@supabase/supabase-js` import (L36) is TYPE-ONLY**
   (`User`, `Session`). Removing it de-lints the file while changing nothing —
   this is the metric-gaming move PATCH-022 explicitly FORBADE. The file's
   real dependency is the `supabaseBrowser` VALUE import at L34 and the ~73
   call sites riding it. Same trap in `FreeformPadletCards.tsx` (type-only
   `User` import at L6, 22 real call sites).
4. **JSX-region concentration:** every site from L6086 to the end (23 sites,
   ~38% of the padlets writes) lives in INLINE JSX handlers inside the render
   tree, not in named functions. The §5 table's "nearest symbol" column is
   only meaningful above L6086; below it, extraction means first lifting the
   handler out of JSX (or extracting the write while leaving the handler),
   which is a different, riskier edit shape than swapping a named function's
   body. Sequence named-function sites first.

## 3. The neighbors (scope boundaries for any canvas patch)

| File | Lines | Supabase surface | Status |
|---|---|---|---|
| `CanvasClient.tsx` | 8,526 | 73 sites + 3 auth (this map) | grandfathered; strangle in 026+ groups |
| `FreeformPadletCards.tsx` | 6,368 | 22 padlets sites | grandfathered; LAST per plan (same ops as CanvasClient's groups) |
| `PostCardContent.tsx` | 936 | ~~1 padlets update~~ → **extracted by PATCH-025** (canvas ops seam, `canvas.toggleTask`) | leaves the grandfather list in 025 |
| canvas hooks (§2.1) | 633+ | 26 sites | NOT grandfathered, NOT lint-visible — needs its own program phase |
| `app/dashboard/canvas/[id]/page.tsx` | 14 | none | thin server shell, passes ids only |

## 4. Auth & realtime facts

- `auth.updateUser` (L263) fires inside a `useEffect` next-tick to persist a
  display-name backfill — a WRITE to the auth record from the canvas page.
  Treat like the profile page's auth passthroughs (Pattern I/J family).
- `auth.getUser` (L279) + `onAuthStateChange` (L296): the seams for these
  already EXIST (`lib/infra/supabase/currentUser.ts`, `authState.ts`,
  Patterns C/F) — the canvas trio should consume them, not grow new ones.
- **No realtime channels:** `.channel(` count in CanvasClient is 0. Live
  collaboration is NOT wired through this file today; do not design the ops
  seam around a subscription model that does not exist yet
  (REALTIME_ARCHITECTURE.md is the target, not the present).

## 5. Full site table (line · table · operation · nearest enclosing symbol)

Generated mechanically (§6). "Symbol" is the nearest preceding declaration at
indent ≤6 — reliable above L6086, JSX-region below (see §2.4).

```
263   (auth)          updateUser   next-tick effect (display-name backfill)
279   (auth)          getUser      fetchUser
296   (auth)          onAuthStateChange  fetchUser
873   padlets         update       (position/meta commit)
1054  boards          update       nextSettings
1151  boards          update       currentShowDotGrid
1436  padlets         update       updates
1576  padlets         update       rootPromises
1593  padlets         update       childrenPromises
1777  padlets         insert       childPayload
1794  padlets         insert       finalContainerPayload
1851  padlets         insert       childPayload
1867  padlets         insert       finalContainerPayload
1937  padlets         update       newChildren
2005  padlets         insert       containerPayload
2458  padlets         insert       childPayload
2476  padlets         insert       finalContainerPayload
2652  padlets         update       commitPadletMeta   << DOUBLE-QUOTED "padlets"
2668  padlets         delete       deletePadletById
2714  padlets         delete       (padlet cascade)
2733  padlets         delete       (children cascade)
2781  padlets         delete       affectedIds
2839  board_sections  insert       (create section)
2891  board_sections  update       handleRenameSection
2906  board_sections  delete       handleDeleteSection
2978  board_sections  update       neighborPosition
2985  board_sections  update       neighborPosition
3024  board_sections  update       positionMap
3103  padlets         update       oldPadlets
3532  padlets         delete       idsToDelete
3657  padlets         insert       containerPadlet
3670  padlets         update       updatedMeta
3700  padlets         update       newMetadata
3730  storage         upload       (padlet-files, one upload fn)
3737  storage         getPublicUrl (padlet-files, same fn)
3751  padlets         update       (file url commit, same fn)
3865  padlets         update       newValue
3913  padlets         update       newMetadata
3995  padlets         update       nextMeta
4076  boards          update       imageUrl
4100  padlets         update       nextMeta
4134  padlets         update       update
4159  padlets         update       migrate
4274  padlets         update       newChildIds
4283  padlets         delete       newChildIds
4319  boards          update       updatedSettings
4362  padlets         insert       (container, single-line)
4427  padlets         update       updates
4467  padlets         insert       ordered
4515  padlets         insert       ordered
4591  padlets         insert       ordered (container)
4593  padlets         insert       ordered (padlet pair)
4824  padlets         insert       (container+post pair)
4826  padlets         update       (same handler)
4855  padlets         insert       (container+post pair)
4856  padlets         insert       (container+post pair)
4922  padlets         insert       (container+post pair)
4923  padlets         insert       (container+post pair)
6086  padlets         update       JSX region from here down (see §2.4)
6118  padlets         update       JSX
6507  padlets         insert       JSX
6548  padlets         update       JSX
6624  padlets         update       JSX
6711  padlets         update       JSX
6762  padlets         delete       JSX
6770  padlets         delete       JSX
6800  padlets         update       JSX
6904  padlets         update       JSX
6912  padlets         update       JSX
6940  padlets         update       JSX
7069  padlets         select       JSX (read-modify-write, comment handler)
7081  padlets         update       JSX (the write half of 7069)
7447  padlets         update       JSX
7508  padlets         update       JSX
7703  padlets         update       JSX
7835  padlets         update       JSX
```

## 6. Regeneration (run this, don't trust §5's line numbers after any edit)

Save as `sitemap-gen.cjs` anywhere, run `node sitemap-gen.cjs` from the repo
root. It prints line/table/op/nearest-symbol rows plus a summary; §1/§5 were
produced by exactly this script plus CTO annotation of the JSX region.

```js
const fs = require('fs');
const src = fs.readFileSync('app/dashboard/canvas/[id]/CanvasClient.tsx', 'utf8');
const lines = src.split(/\r?\n/);
const fnRe = /^\s*(?:const|function|async function)\s+([A-Za-z0-9_]+)\s*(?:=|\()/;
const fromRe = /\.from\((['"])([a-z_-]+)\1\)/;
const opRe = /\.(select|insert|update|delete|upsert)\(/;
const decls = [];
lines.forEach((l, i) => {
  const m = l.match(fnRe);
  if (m) decls.push({ line: i + 1, name: m[1], indent: l.match(/^\s*/)[0].length });
});
const enclosing = (n) => {
  let best = null;
  for (const d of decls) if (d.line <= n && d.indent <= 6) best = d;
  return best ? best.name : '?';
};
const rows = [];
lines.forEach((l, i) => {
  const m = l.match(fromRe);
  if (!m) return;
  const isStorage = /storage\s*$/.test(lines[i - 1] || '') || /supabase\.storage/.test(l);
  let op = null;
  for (let j = i; j < Math.min(i + 4, lines.length); j++) {
    const om = lines[j].match(opRe);
    if (om) { op = om[1]; break; }
  }
  if (isStorage) op = /upload/.test(lines[i + 1] || '') ? 'storage.upload' : 'storage.getPublicUrl';
  rows.push({ line: i + 1, table: m[2], op: op || '??', fn: enclosing(i + 1) });
});
lines.forEach((l, i) => {
  const am = l.match(/supabase\.auth\.(\w+)/);
  if (am) rows.push({ line: i + 1, table: '(auth)', op: am[1], fn: enclosing(i + 1) });
});
rows.sort((a, b) => a.line - b.line);
for (const r of rows) console.log(`${r.line}\t${r.table}\t${r.op}\t${r.fn}`);
const sum = {};
for (const r of rows) { const k = r.table + ' ' + r.op; sum[k] = (sum[k] || 0) + 1; }
console.log('---summary---');
Object.entries(sum).sort().forEach(([k, v]) => console.log(v + '\t' + k));
```

Point it at `FreeformPadletCards.tsx` or the hooks by changing the path.
Caveats the script inherits: nearest-symbol is heuristic (JSX region, §2.4);
storage detection assumes the `supabase.storage\n.from(...)` two-line shape.

## 7. Sequencing implications for 026+ (design guidance, not bindings)

- **Group by table+operation** (the standing batch-plan rule). The natural
  order: `board_sections` first (6 sites, 3 named handlers, self-contained
  section CRUD — smallest coherent group); then `boards` updates (4 sites,
  settings-shaped, Pattern A-adjacent); then `padlets` DELETE family (8
  sites — note the parent+children cascade pairs at 2714/2733 and
  4274/4283: one user action, two statements, extract as ONE command);
  then `padlets` INSERT family (19 sites but heavily patterned:
  container+child pairs at 4591/4593, 4824+, 4855/4856, 4922/4923 — again
  one action, paired statements); `padlets` UPDATE last and in slices
  (33 sites, and 18 of them are in the JSX region).
- **The repository grows per group, the seam stays one seam:** PATCH-025's
  `PostsRepository` (`lib/domain/canvas/posts.ts` + `lib/infra/canvas/
  postsRepository.ts`) is the trunk. Each group adds methods + commands to
  the same aggregate; do NOT create a second canvas repository (P6).
- **Auth trio:** consume the EXISTING `currentUser.ts`/`authState.ts` seams;
  `auth.updateUser` needs a small command of its own (profile-adjacent).
- **Storage pair:** `storage.ts` gateway (Pattern H) already exists — the
  upload function is a direct Pattern H consumer swap.
- **Hooks phase:** after (or interleaved with) the write groups, the read
  hooks (§2.1) get repositories; only then does banning
  `@/lib/supabase/browser` in UI (the queued lint extension) become
  possible without grandfathering the hooks.
- **FreeformPadletCards LAST** (standing plan) — its 22 sites repeat
  CanvasClient's update/insert shapes; by then every needed repository
  method exists.
- **Realtime/presence:** CTO-only, undesigned (standing plan). Nothing in
  this map blocks it; nothing here implements it.
