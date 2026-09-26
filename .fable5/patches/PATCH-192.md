# PATCH-192 — perf: the canvas "Back to Dashboard" button

Status: AUTHORIZED (owner, 2026-09-26: "Yes please")
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: `2cf412cd`
Read first:
- `app/dashboard/canvas/[id]/CanvasClient.tsx` — the three `onBack={() => router.push('/dashboard')}`
  (around lines 8900, 8911 and 8980) and where `router` is created;
- `app/dashboard/page.tsx` — `loadData` (lines ~93–160) and the folder dialog's `EmojiPicker`
  (import at line 16, used around line 724);
- `lib/workspace/context.ts` (`resolveCurrentWorkspace`) and `lib/auth/permissions.ts`
  (`getWorkspaceEntitlements`);
- `components/collabboard/BoardSeekableVideo.tsx` — the `next/dynamic` precedent to copy;
- `vitest.config.ts` `include` — `lib/dashboard/**` is NOT included yet; add one line for it,
  or the new test is silently not run.

---

## 1. Why

The owner reports the canvas back button "seems really slow". Measured live (dev server, CDP),
warm click, ~950 ms from click to board list:

| after click | what happens |
|---|---|
| 0–550 ms | the canvas stays on screen; nothing visible changes |
| ~370 ms | the browser only NOW fetches `/dashboard` and its page chunk (6 MB in dev; 1.3 MB of it `emoji-picker-react`) — nothing was fetched in advance, because the button calls `router.push` with no prefetch |
| 550–950 ms | spinner, while `loadData` runs ~8 Supabase round trips strictly one after another |

Three fixes, each independent.

## 2. The design

### 2.1 Prefetch the dashboard from the canvas — `CanvasClient.tsx`

Add ONE effect next to where `router` is created:

```ts
useEffect(() => {
  router.prefetch('/dashboard');
}, [router]);
```

with a one-line comment saying why (the back button navigates there; without this the route's
code and payload are fetched only after the click). Leave the three `onBack` props and the
button components (`CanvasSidebar`, `KanbanShell`, `GanttShell`) unchanged — their tests pass
`onBack` directly, and `CanvasSidebar` measures the button through a button ref.

### 2.2 Load the emoji picker only when it opens — `app/dashboard/page.tsx`

Replace the static `import EmojiPicker from 'emoji-picker-react'` with `next/dynamic`,
`ssr: false`, with a small loading placeholder the size of the picker's box (a plain `div`, no new
dependency). The picker is only rendered when `isEmojiPickerOpen` is true, so it downloads on first
open. Props and behaviour at the call site stay identical.

### 2.3 Fetch dashboard data in parallel — new `lib/dashboard/loadDashboardData.ts`

Extract the network part of `loadData` into a pure-ish function the page calls:

```ts
export async function loadDashboardData(supabase, user): Promise<{
  workspace: WorkspaceContext | null;
  entitlements: EntitlementsContext | null;   // null when it failed
  canvases: Canvas[];                          // [] when it failed
  folders: FolderRow[];                        // [] when it failed or the table is missing
}>
```

Order:
1. `resolveCurrentWorkspace(supabase, user)` — failure → `null`, logged as today
   (`'Workspace resolution fallback:'`). Everything below depends on it, so it stays first.
2. Then, **concurrently** (`Promise.all` over three promises that each catch their own error):
   - `getWorkspaceEntitlements(supabase, workspace?.workspaceId)`;
   - the boards query (unchanged: `select('*')`, `order('updated_at', desc)`, `eq workspace_id` or
     `eq user_id`);
   - the folders query (unchanged).
3. Each failure is logged with the same messages as today (`'Error loading canvases:'`,
   `'Error loading folders:'`, and `'Error loading entitlements:'` for the new one) and yields its
   empty value. **Deliberate behaviour change:** today an entitlements throw aborts `loadData`
   before the boards are read, so the dashboard shows no boards; now the boards still load. Say so
   in the commit.

The page keeps: `getUser` → `/auth` redirect, the `setX` calls, the folder `canvasCount`
computation, `setLoading(false)` in `finally`, and `formatError`. Move `Canvas` / folder row types
only as far as needed to type the function (export them from the new module and import them in the
page). Leave the page's other handlers (create, delete, favourite, folders CRUD) untouched.

## 3. Tests

New `lib/dashboard/loadDashboardData.test.ts`, with a fake supabase client (query-builder chain
returning controllable promises) and mocked `resolveCurrentWorkspace` / `getWorkspaceEntitlements`:
- **concurrency, proven by the real schedule:** entitlements, boards and folders are all STARTED
  before any of them resolves (hold all three on deferred promises; assert all three were called;
  then resolve). This must fail against a sequential implementation — check that by temporarily
  making it sequential and reporting that the test failed, then restore.
- workspace present → boards and folders filter `workspace_id`; absent → `user_id`;
- boards error → `canvases: []`, folders and entitlements still returned;
- folders error / throw → `folders: []`, canvases still returned;
- entitlements throw → `entitlements: null`, canvases still returned (the §2.3 behaviour change);
- workspace resolution throws → `workspace: null`, and the queries use `user_id`.

No test for §2.1 or §2.2 beyond tsc: a source-string test would only restate the code. The CTO
verifies both live (§5).

## 4. Allowed files

```
app/dashboard/canvas/[id]/CanvasClient.tsx       (§2.1: the one effect, plus an import if needed)
app/dashboard/page.tsx                           (§2.2, §2.3)
lib/dashboard/loadDashboardData.ts               (new)
lib/dashboard/loadDashboardData.test.ts          (new)
vitest.config.ts                                 (one include line for lib/dashboard/**/*.test.ts)
```

Everything else is forbidden, including `package.json`, the database, and the three button
components. If anything conflicts with the code or is unclear, STOP and ask, with the conflict
written out: the spec line, the code at file:line, and your proposed resolution. Never use git
stash, reset, restore, checkout, clean, commit or push. Never run a production build. Make every
edit with a real tool call; never write a tool call, a `<bash>` block or a command out as text.

## 5. Verification

```
npx tsc --noEmit
npx vitest run lib/dashboard
npx vitest run --reporter=json --outputFile=.opencode-vitest-192.json
```

The failing FILE set must equal the 26-file baseline. Report: files changed, tests added, the
output, and the sequential-mutation result from §3. Do not commit.

The CTO then repeats the live timing on CDP 9333 (dev): before = ~950 ms warm, canvas frozen
~550 ms, `app/dashboard/page.js` fetched after the click. After: the page chunk and `/dashboard`
payload are fetched while the canvas is open, not after the click; the emoji chunk is absent from
the dashboard load and appears on first opening of the folder dialog's picker; the entitlements,
boards and folders requests overlap.

## 6. Commit message (verbatim)

```
perf(dashboard): the canvas back button no longer waits on the network

The canvas prefetches /dashboard, so the route's code and payload are ready
before the click. The emoji picker loads when the folder dialog opens it
instead of with the dashboard. After the workspace resolves, entitlements,
boards and folders load in parallel (lib/dashboard/loadDashboardData.ts).

Behaviour change: an entitlements failure no longer hides the boards; it is
logged and the dashboard still lists them.
```
