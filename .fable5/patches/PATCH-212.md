# PATCH-212 — Every post write rounds its geometry, in one place

Status: AUTHORIZED (owner, 2026-09-29: "yes" to the central rounding fix).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-211 (`7fae22b7`)

## Why
PATCH-209 fixed one path, the Section Heading resize, which wrote `position_x: -2995.9999999999995`
into an integer column (Postgres 22P02, write refused, change rolled back). Its audit found more
unrounded geometry writes:
- `components/collabboard/canvas/hooks/useCanvasActions.ts` ~190 (paste), ~208-216 (add at viewport
  centre), ~234 (comment pin), ~288 (`savePadletPosition`);
- `components/collabboard/canvas/layouts/DrawingLayout.tsx` ~3420, ~3449 (positions), ~3445 (natural
  resize width).
Each one fails the same way at any zoom that is not 100%. Fixing them one by one leaves the next new
path exposed, so the rounding moves to where every write passes.

## Design
1. **A pure helper** `roundPostGeometry<T extends object>(fields: T): T` in
   `lib/domain/canvas/postGeometry.ts` (new):
   - returns a COPY (never mutate) in which `position_x`, `position_y`, `width` and `height`, when
     present and a finite number, are `Math.round`ed;
   - leaves `null`, `undefined`, non-numbers and every other key untouched;
   - leaves a non-finite number untouched as well (it must fail loudly as today, not be hidden).
2. **Apply it in the repository** (`lib/infra/canvas/postsRepository.ts`): `updateFieldsById`,
   `insert`, `insertReturning`, and `updatePosition` (round `positionX` / `positionY` there).
3. **Apply it at every DIRECT `from('padlets')` write that can carry geometry.** Candidates found by
   the CTO: `hooks/canvas/usePadletSave.ts`, `components/canvas/WallCanvas.tsx`,
   `components/canvas/layouts/TableLayout.tsx`, `lib/infra/collabboard/imageDurableContent.ts`,
   `lib/collabboard/templates/template1.ts`. Open each and check whether its payload can include
   position/size. Wrap the payload only where it can. List each file with "wrapped" or "no geometry".
   Do not touch test files or `app/api/workspace/data-hygiene`.
4. Also round the local optimistic state where a caller keeps the unrounded value on screen after
   the write, IF that is a one-line change at that caller. Otherwise leave it: a sub-pixel
   difference on screen is harmless, and the next load reads the rounded value.

## Tests
- `postGeometry.test.ts`:
  - fractions round (-2995.9999999999995 → -2996, 12.5 → 13);
  - integers unchanged;
  - null/undefined/strings untouched;
  - other keys untouched;
  - the input object is not mutated;
  - NaN/Infinity are left as they are.
- Repository: `updateFieldsById` and `insert` send rounded geometry to the client (mock the Supabase
  client and assert the payload).
- `usePadletSave` (or whichever creates a post at a computed position): a fractional position is
  written rounded.
- **Mutation:** remove the call in `updateFieldsById` → the repository test fails.

## Allowed files
```
lib/domain/canvas/postGeometry.ts (+ test)                     (new)
lib/infra/canvas/postsRepository.ts (+ its test)
hooks/canvas/usePadletSave.ts, components/canvas/WallCanvas.tsx, components/canvas/layouts/TableLayout.tsx,
lib/infra/collabboard/imageDurableContent.ts, lib/collabboard/templates/template1.ts   (only to wrap a geometry payload)
```
Forbidden: the database, migrations, column types, `package.json`, the layouts' own geometry math.
**Do not touch the comments inside `isBlockingEditorModalOpen`.** If a census or source test pins a
repository method body or a payload shape, STOP and ask (spec line, code at file:line, proposed
resolution).

Use `rg` or `timeout 30` for searches. Every test command is `timeout 600 npx vitest run …`. Delete
temporary diagnostic files (bash: `/dev/null`, never `nul`). No
stash/reset/restore/checkout/clean/commit/push; no production build. Real tool calls only.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/domain/canvas lib/infra/canvas hooks/canvas
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-212.json
```
The failing FILE set must equal the 26-file baseline. Compact report, including the per-file list
from 3. Do not commit.

**Live (CTO, own tab, 80% zoom):** paste or add a note at the centre of the view, and check the write
is accepted with integer positions. The CTO deletes the test note afterwards.

## Commit message (verbatim)
```
fix(canvas): every post write rounds its position and size

Positions and sizes computed at a zoom other than 100% are fractional,
and the integer columns refuse them -- the Section Heading resize was
one such path, and paste, add-at-centre, comment pins and the drawing
canvas were others. A single helper now rounds position_x/position_y/
width/height at the repository and at the few direct writes, so no
current or future path can send a fraction.
```
