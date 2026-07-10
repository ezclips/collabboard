# PATCH-038 — hooks phase opener, strangler group 13: the useCanvasInteractions drag-commit family onto the EXISTING command quartet — the interactions hook goes supabase-FREE

**Status:** READY FOR IMPLEMENTATION
**Model:** **GPT-5.4 acceptable** (Pattern K, thirteenth application — pure consumer swaps of already-pinned commands, the PATCH-033 shape; see §0.5)
**Pattern:** K reuse (§5.11), SECOND ONE-FILE patch: zero domain changes, zero infra changes, zero test changes, zero new tests
**Scope:** `components/collabboard/canvas/hooks/useCanvasInteractions.ts` — **ONE file.**
**Authored:** 2026-07-11 (Fable 5 CTO). Census measured at commit `ad14fae`; the full post-edit file compiled `tsc --strict` UNREWRITTEN against the real repo module graph (a scratch tsconfig supplying the repo baseUrl/paths — the strongest compile gate of the program so far: no import rewriting at all); the existing suite re-run 201/25 GREEN at authoring as the fidelity baseline; every gate below measured on the CTO's edit simulation, including the bound post-edit hash.

> Implementer: read PATCH_REFERENCE §5.11 and §6 first. The whole-file fence
> in §2 is authoritative; §3's five OLD/NEW pairs are the edit recipe. Never
> edit a bound test; STOP and report instead (§8).

---

## 0. CTO rulings

### 0.1 The hooks-phase census and family classification (regenerated 2026-07-11 at `ad14fae`)

CanvasClient itself performs ZERO direct supabase operations since
PATCH-037. The hooks layer holds exactly **26 table sites + 1 realtime
channel**, plus the three CanvasClient client hand-offs:

| Family | Sites | Where | Contract facts | Disposition |
|---|---|---|---|---|
| 1. fetchData read quartet | 4 reads (boards/padlets/canvas_lines/board_sections) | useCanvasData L61/67/73/79 | four SEQUENTIAL awaits; DIFFERENTIAL error contract (canvas/padlet errors console+throw→setError; lineError deliberately unthrown "table may not exist"; sectionError never read); `showLoading` gate | own future patch — needs the canvas_lines-aggregate decision first |
| 2. section-recovery write cluster | 2 writes (board_sections insert + padlets update loop) | useCanvasData L127/L147 | interleaved with Family 1's data flow; own try/catch + toast.warning + synthetic-section fallback | own future patch (rides or follows Family 1) |
| 3. realtime channel | 1 | useCanvasData L261 | postgres_changes subscription + removeChannel cleanup + thumbnail-on-unmount | CTO-only, undesigned — excluded from delegation |
| 4. lines write family | 5 (4 in useCanvasData L340/388/408/479 + 1 in useCanvasLines L41) | canvas_lines | EXTREME swallow contracts (`if (error) { }` empty blocks, empty catches); duplicateLine rollback; createLine's resolved-error → LOCAL TEMP-LINE fallback; useCanvasLines takes `supabase: any` as a PARAM | needs a NEW canvas_lines aggregate — its own patch(es); the hook's supabase param retires with it |
| 5. padlet mutation family | 10 (useCanvasData L495–L593) | padlets | content/title stamped writes (NEW column shapes — the title write here is STAMPED, unlike 035's unstamped clear); 3 inserts with three different rollback contracts; 4 RAW-PASSTHROUGH members (insertPadlet/insertPadletAndSelectSingle/updatePadletById/deletePadletByIdRaw) whose CanvasClient consumers destructure raw `{ error }` — extracting those touches their call sites too | own future patch(es), sliced by contract |
| 6. **drag-commit family** | **4 (useCanvasInteractions L344/404/413/444)** | padlets | grouped-drag Promise.all position writes; drop-into-container metadata pair; single-drag position commit — ALL map onto ALREADY-PINNED commands with ZERO new domain surface | **THIS PATCH** |
| 7. client hand-offs | 3 (CanvasClient L251 workspace resolve / ~L734 lines-hook param / L2554 FreeformGraphRepo) | — | workspace: the PATCH-021 `resolveWorkspaceForUser` wrapper ALREADY EXISTS (one-line swap, but its file header fences consumers — needs a CTO fence amendment); lines-hook param retires with Family 4; FreeformGraphRepo = 5 sites on freeform_graph_edges/settings — its own family | each deferred BY NAME |

FreeformPadletCards (grandfather list) stays LAST, per standing order.

### 0.2 Slice ruling: Family 6 is the smallest SAFE first slice

- **Zero new domain/infra/test surface.** All four sites are consumer
  swaps of `canvas.updatePostPosition` (034, honest) and
  `canvas.updatePostMetadataBestEffort` (032, swallow) — every semantic
  is already test-pinned; the fidelity net is the EXISTING 62-test posts
  suite re-run (201/25 green at authoring).
- **The contracts map onto three ESTABLISHED idioms byte-for-byte**:
  the fail-fast `Promise.all` per-element wrapper (032 Ruling 1), the
  bare-await-inside-try pair with first-throw-aborts-second ordering
  (033's onDropExistingPadlet contract, literally the same drop-into-
  container feature on the freeform layout), and the honest
  check-and-throw position commit.
- **NO authorized behavior change anywhere** — notably the single-drag
  commit (L444): unlike 034's drop-repositioning sibling, BOTH legacy
  channels already converge on the same catch (`if (error) throw` and a
  thrown network error land in the SAME `catch (err)` console.error) —
  the honest command ports it exactly with no convergence authorization
  needed.
- Alternatives considered and deferred: Family 1 (the natural opener by
  size) requires either inventing the canvas_lines aggregate or an
  incoherent 3-of-4 slice, plus four new casts on the `any`-typed rows
  and hot-path risk — it goes SECOND, after the lines-aggregate ruling;
  the workspace hand-off is a one-line swap but needs a consumer-fence
  amendment on workspaceMembers.ts — deferred by name, may ride a later
  slice.

### 0.3 Behavior preservation (the owner's six axes)

- **Loading:** no loading flags exist at any of the four sites; none
  added.
- **Error:** per-site contracts EXACT — see §0.4.
- **Retry:** none exists; none added. The grouped-drag catch's
  `fetchData()` is a REFRESH-on-failure (not a retry) and stays
  byte-identical inside its catch.
- **Subscription:** the realtime channel lives in useCanvasData —
  untouched. This hook's only realtime interaction is the suppression
  CACHE below.
- **Cache:** all six `markPadletLocallyModified(...)` calls (the
  realtime-suppression cache) stay BYTE-IDENTICAL at their exact
  positions — before the write in the grouped map, both calls before
  the container pair, before the try in the single commit.
- **Ordering:** the grouped drag keeps `Promise.all` fail-fast
  semantics via the per-element throw-on-!ok wrapper (first thrown-mode
  failure rejects the batch with the ORIGINAL error object; resolved
  errors swallow inside the command exactly as the legacy resolved
  `{ error }` threw per-element — wait, no: legacy threw on RESOLVED
  errors per-element too, and the honest command returns err for
  resolved errors, which the wrapper re-throws — BOTH channels
  batch-reject exactly as before); the container pair keeps container
  → dragged sequential order with first-throw-aborts-second; the
  single commit is one statement.
- **Timestamps:** the commands stamp `updated_at` with their own
  `new Date().toISOString()` at execute time instead of the inline
  literal — the established accepted fact from 032/033/034 (same
  commands, same sites family).

### 0.4 Per-site contracts (confirm, don't re-justify)

| Site | Legacy | Port |
|---|---|---|
| L344 grouped drag | per-element `if (error) throw error` inside `Promise.all` → catch: console.error + `fetchData()` | ONE `updatePostPosition` instance created before the batch (the 032 batch idiom); per element: `if (!result.ok) throw result.error.cause ?? result.error` — resolved AND thrown both reject the batch with the original error, reaching the same catch |
| L404+L413 container pair | two bare-awaited metadata writes inside try (resolved errors SWALLOWED; thrown → catch console.error); container write FIRST, dragged second | `updatePostMetadataBestEffort` ×2 with cause-unwrap throws — resolved swallowed INSIDE the command (existing pin), thrown re-thrown into the same catch; sequential order and the reused `newMetadata` const (feeding the setPadlets below) byte-kept |
| L444 single commit | `if (error) { throw error; }` → catch console.error — thrown channel reaches the SAME catch (already converged in legacy) | honest `updatePostPosition` + `if (!result.ok) { throw result.error.cause ?? result.error; }` — EXACT in both channels, NO authorization needed |

Surrounding math byte-kept: `Math.max(0, Math.round(...))` in the
grouped map; `committedX`/`committedY` (Math.round, deliberately NO
clamp) at the single commit.

### 0.5 The hook exits supabase entirely + model

With the four sites swapped, the hook's `const supabase =
supabaseBrowser();` (and its two-line comment) plus the
`@/lib/supabase/browser` import are DEAD — no dependency-array
references exist in this file (grep-proven; the supabase-bearing dep
arrays are CanvasClient's). They are REMOVED (deletions-only rider,
census-gated `supabase` 7→0): the interactions hook ends the patch
supabase-free, the template for every hooks-phase slice that follows.
Boundary posture: the lint bans `@supabase/*` imports only — this file
was never grandfathered and passes today via the wrapper import; the
swap replaces that import with the sanctioned domain/infra pair.
ZERO new casts. ZERO new tests (pure consumer patch — the 033
precedent). **GPT-5.4 acceptable**: every swap shape compiled
`tsc --strict` against the LIVE domain module in the CTO's scratch,
with NO import rewriting (repo-tsconfig paths supplied to a scratch
project — the exact canonical bytes compiled).

---

## 1. Pre-edit gates (Git Bash from repo root; any mismatch = STOP)

```bash
git status --short                        # nothing
git log --oneline -1                      # ad14fae (or a descendant touching none of the scoped/must-not-change files)
```

Byte-identity:

```bash
git hash-object components/collabboard/canvas/hooks/useCanvasInteractions.ts   # 0c175c2d699baf7d0bdcad6962bb5f4a28aa43dc
```

MUST-NOT-CHANGE hashes (re-checked after the edit in §7):

```bash
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx"   # 57a56ef8595c8ebc4b655a1fd811904049bbd155
git hash-object lib/domain/canvas/posts.ts                     # 9d64acb5d9660c20e6b06f86e7339edee2810a03
git hash-object lib/infra/canvas/postsRepository.ts             # 7af06d87042c7a378d73c9943f11e4eb53d2392d
```

Hook census (measured 2026-07-11):

```bash
H="components/collabboard/canvas/hooks/useCanvasInteractions.ts"
wc -l "$H"                                # 509
grep -c '^[[:space:]]*$' "$H"             # 55
grep -c "\.from('padlets')" "$H"          # 4
grep -c "supabase" "$H"                   # 7   (import + comment pair + declaration + the 4 statement heads)
grep -c "markPadletLocallyModified" "$H"  # 6
grep -c "createUpdatePostPositionCommand\|createUpdatePostMetadataBestEffortCommand\|createPostsRepository" "$H"   # 0
```

Suite baseline:

```bash
npx vitest run 2>&1 | tail -3             # 25 files, 201 tests
npx playwright test --list 2>&1 | tail -1 # Total: 27 tests in 18 files
```

---

## 2. BOUND FILE — `components/collabboard/canvas/hooks/useCanvasInteractions.ts` (whole file, exact, 489 lines; CTO compile-verified UNREWRITTEN; post-edit hash `0e55b8e71e16f3e5416120fa0a69ce8c810ec065`)

Replace the file with exactly:

```ts
"use client";

import { useEffect, useRef, useState } from 'react';
import {
  createUpdatePostMetadataBestEffortCommand,
  createUpdatePostPositionCommand,
} from '@/lib/domain/canvas/posts';
import { createPostsRepository } from '@/lib/infra/canvas/postsRepository';
import type { NewPostDragState, Padlet } from '@/types/collabboard';
import { debugCanvasLogger } from '@/lib/collabboard/debugCanvasLogger';
import { isContainerPadlet } from '@/components/collabboard/canvas/engine/utils';

interface UseCanvasInteractionsParams {
  containerRef: React.RefObject<HTMLDivElement | null>;
  canvasZoom: number;
  canEditCanvas: boolean;
  padlets: Padlet[];
  setPadlets: React.Dispatch<React.SetStateAction<Padlet[]>>;
  selectedPadletIds: string[];
  isLineMode: boolean;
  isAnyEditorOpen: boolean;
  isFreeformGraphMode: boolean;
  isGraphConnectMode: boolean;
  setSelectedPadletId: (v: string | null) => void;
  newPostDragState: NewPostDragState;
  setNewPostDragState: React.Dispatch<React.SetStateAction<NewPostDragState>>;
  setNewPostHoverContainerId: React.Dispatch<React.SetStateAction<string | null>>;
  newPostHoverContainerId: string | null;
  handlePlaceInExisting: (containerId: string) => void;
  setIsPlacementPromptOpen: (v: boolean) => void;
  markPadletLocallyModified: (padletId: string) => void;
  fetchData: (showLoading?: boolean) => Promise<void>;
  PADLET_DRAG_START_DISTANCE: number;
}

export function useCanvasInteractions({
  containerRef,
  canvasZoom,
  canEditCanvas,
  padlets,
  setPadlets,
  selectedPadletIds,
  isLineMode,
  isAnyEditorOpen,
  isFreeformGraphMode,
  isGraphConnectMode,
  setSelectedPadletId,
  newPostDragState,
  setNewPostDragState,
  setNewPostHoverContainerId,
  newPostHoverContainerId,
  handlePlaceInExisting,
  setIsPlacementPromptOpen,
  markPadletLocallyModified,
  fetchData,
  PADLET_DRAG_START_DISTANCE,
}: UseCanvasInteractionsParams) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [draggingPadletId, setDraggingPadletId] = useState<string | null>(null);
  const [lastMousePosition, setLastMousePosition] = useState({ x: 0, y: 0 });

  const dragEndInFlightRef = useRef(false);
  const isDraggingRef = useRef(false);
  const draggingPadletIdRef = useRef<string | null>(null);
  const draggingPadletIdsRef = useRef<string[]>([]);
  const handleCanvasMouseUpRef = useRef<() => void>(() => { });
  const bodyUserSelectRef = useRef<{ userSelect: string; webkitUserSelect: string } | null>(null);

  const pendingDragRef = useRef<{
    padletId: string;
    padletIds: string[];
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    selectOnDragStart: boolean;
  } | null>(null);

  // Tracks the committed drag position so handleCanvasMouseUp always saves
  // the correct coordinates even when the last setPadlets hasn't re-rendered yet.
  const lastDragPositionRef = useRef<{ x: number; y: number } | null>(null);
  const lastDragDeltaRef = useRef<{ dx: number; dy: number } | null>(null);
  const dragSelectionStartPositionsRef = useRef<Record<string, { x: number; y: number }>>({});

  const lockBodySelection = () => {
    if (bodyUserSelectRef.current) return;
    const body = document.body;
    bodyUserSelectRef.current = {
      userSelect: body.style.userSelect,
      webkitUserSelect: (body.style as any).webkitUserSelect || '',
    };
    body.style.userSelect = 'none';
    (body.style as any).webkitUserSelect = 'none';
  };

  const unlockBodySelection = () => {
    const body = document.body;
    const prev = bodyUserSelectRef.current;
    if (!prev) return;
    body.style.userSelect = prev.userSelect;
    (body.style as any).webkitUserSelect = prev.webkitUserSelect;
    bodyUserSelectRef.current = null;
  };

  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);

  useEffect(() => {
    draggingPadletIdRef.current = draggingPadletId;
  }, [draggingPadletId]);

  useEffect(() => {
    if (isDragging) {
      lockBodySelection();
    }
  }, [isDragging]);

  useEffect(() => {
    return () => {
      unlockBodySelection();
    };
  }, []);

  const handlePadletMouseDown = (e: React.MouseEvent, padletId: string) => {
    debugCanvasLogger('pointerDown', { padletId, x: e.clientX, y: e.clientY });
    if ((e.target as HTMLElement).closest('[data-no-drag="true"]')) return;
    if (!canEditCanvas) return;

    if (isFreeformGraphMode && isGraphConnectMode) {
      e.preventDefault();
      e.stopPropagation();
      setSelectedPadletId(padletId);
      return;
    }

    lockBodySelection();

    const padlet = padlets.find(p => p.id === padletId);
    if (!padlet || isLineMode) return;
    if ((padlet.metadata as any)?.isLocked) return;
    if (isAnyEditorOpen) {
      return;
    }

    const isTemporaryGroupDrag =
      selectedPadletIds.length > 1 &&
      selectedPadletIds.includes(padletId);
    const dragPadletIds = isTemporaryGroupDrag ? [...selectedPadletIds] : [padletId];

    const rect = e.currentTarget.getBoundingClientRect();
    pendingDragRef.current = {
      padletId,
      padletIds: dragPadletIds,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: (e.clientX - rect.left) / canvasZoom,
      offsetY: (e.clientY - rect.top) / canvasZoom,
      selectOnDragStart: !isTemporaryGroupDrag,
    };
    if (!isTemporaryGroupDrag) {
      setSelectedPadletId(padletId);
    }
  };

  const handleImagePadletDrag = (e: React.MouseEvent, padletId: string) => {
    if ((e.target as HTMLElement).closest('[data-no-drag="true"]')) return;
    if (!canEditCanvas) return;
    lockBodySelection();

    const padlet = padlets.find(p => p.id === padletId);
    if (!padlet || isLineMode) return;
    if ((padlet.metadata as any)?.isLocked) return;
    if (isAnyEditorOpen) {
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    pendingDragRef.current = {
      padletId,
      padletIds: [padletId],
      startX: e.clientX,
      startY: e.clientY,
      offsetX: (e.clientX - rect.left) / canvasZoom,
      offsetY: (e.clientY - rect.top) / canvasZoom,
      selectOnDragStart: false,
    };
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!canEditCanvas) return;
    if (isDragging && e.buttons === 0) {
      handleCanvasMouseUp();
      return;
    }
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;

    const scrollLeft = containerRef.current?.scrollLeft || 0;
    const scrollTop = containerRef.current?.scrollTop || 0;
    const mouseX = (e.clientX - containerRect.left + scrollLeft) / canvasZoom;
    const mouseY = (e.clientY - containerRect.top + scrollTop) / canvasZoom;

    if (!isDragging && pendingDragRef.current) {
      const pending = pendingDragRef.current;
      const dx = (e.clientX - pending.startX) / canvasZoom;
      const dy = (e.clientY - pending.startY) / canvasZoom;
      if (Math.hypot(dx, dy) >= PADLET_DRAG_START_DISTANCE) {
        e.preventDefault();
        setDragOffset({ x: pending.offsetX, y: pending.offsetY });
        debugCanvasLogger('dragStart', { padletId: pending.padletId });
        setIsDragging(true);
        setDraggingPadletId(pending.padletId);
        draggingPadletIdsRef.current = pending.padletIds;
        if (pending.padletIds.length > 1) {
          dragSelectionStartPositionsRef.current = Object.fromEntries(
            padlets
              .filter((padlet) => pending.padletIds.includes(padlet.id))
              .map((padlet) => [
                padlet.id,
                { x: padlet.position_x || 0, y: padlet.position_y || 0 },
              ])
          );
        } else {
          dragSelectionStartPositionsRef.current = {};
        }
        if (pending.selectOnDragStart) {
          setSelectedPadletId(pending.padletId);
        }
        pendingDragRef.current = null;
      }
    }

    // Ghost drag tracking is handled by the useEffect in CanvasClient
    if (newPostDragState.isActive) return;

    if (!isDragging || !draggingPadletId) return;

    const edgeThreshold = 60;
    const scrollSpeed = 15;
    const container = containerRef.current;

    if (container) {
      const mouseRelX = e.clientX - containerRect.left;
      const mouseRelY = e.clientY - containerRect.top;

      if (mouseRelX < edgeThreshold) {
        container.scrollLeft -= scrollSpeed;
      } else if (mouseRelX > containerRect.width - edgeThreshold) {
        container.scrollLeft += scrollSpeed;
      }

      if (mouseRelY < edgeThreshold) {
        container.scrollTop -= scrollSpeed;
      } else if (mouseRelY > containerRect.height - edgeThreshold) {
        container.scrollTop += scrollSpeed;
      }
    }

    const updatedScrollLeft = containerRef.current?.scrollLeft || 0;
    const updatedScrollTop = containerRef.current?.scrollTop || 0;

    const newX = (e.clientX - containerRect.left + updatedScrollLeft) / canvasZoom - dragOffset.x;
    const newY = (e.clientY - containerRect.top + updatedScrollTop) / canvasZoom - dragOffset.y;

    setLastMousePosition({ x: mouseX, y: mouseY });

    debugCanvasLogger('dragMove', { padletId: draggingPadletId, x: newX, y: newY });

    const clampedX = Math.max(0, newX);
    const clampedY = Math.max(0, newY);
    const draggedPadletIds = draggingPadletIdsRef.current;

    if (draggedPadletIds.length > 1) {
      const startPositions = dragSelectionStartPositionsRef.current;
      const anchorStart = startPositions[draggingPadletId];
      if (!anchorStart) return;
      const dx = clampedX - anchorStart.x;
      const dy = clampedY - anchorStart.y;
      lastDragDeltaRef.current = { dx, dy };

      setPadlets(prev => prev.map((padlet) => {
        if (!draggedPadletIds.includes(padlet.id)) return padlet;
        const start = startPositions[padlet.id];
        if (!start) return padlet;
        return {
          ...padlet,
          position_x: Math.max(0, start.x + dx),
          position_y: Math.max(0, start.y + dy),
        };
      }));
      return;
    }

    lastDragPositionRef.current = { x: clampedX, y: clampedY };

    setPadlets(prev => prev.map(p =>
      p.id === draggingPadletId
        ? { ...p, position_x: clampedX, position_y: clampedY }
        : p
    ));
  };

  const handleCanvasMouseUp = async () => {
    debugCanvasLogger('pointerUp', {});
    if (dragEndInFlightRef.current) return;
    dragEndInFlightRef.current = true;
    try {
      if (!canEditCanvas) {
        pendingDragRef.current = null;
        draggingPadletIdsRef.current = [];
        dragSelectionStartPositionsRef.current = {};
        lastDragDeltaRef.current = null;
        lastDragPositionRef.current = null;
        setIsDragging(false);
        setDraggingPadletId(null);
        return;
      }
      const currentDraggingId = draggingPadletIdRef.current;
      const currentIsDragging = isDraggingRef.current;
      const currentDraggingIds = draggingPadletIdsRef.current;
      if (pendingDragRef.current) {
        pendingDragRef.current = null;
      }

      // Ghost drag drop is handled by the useEffect in CanvasClient
      if (newPostDragState.isActive) return;

      if (currentIsDragging && currentDraggingId) {
        if (currentDraggingIds.length > 1) {
          const dragDelta = lastDragDeltaRef.current;
          const startPositions = dragSelectionStartPositionsRef.current;
          lastDragDeltaRef.current = null;
          dragSelectionStartPositionsRef.current = {};
          if (dragDelta) {
            try {
              const updatePostPosition = createUpdatePostPositionCommand(createPostsRepository());
              await Promise.all(
                currentDraggingIds.map(async (padletId) => {
                  const start = startPositions[padletId];
                  if (!start) return;
                  const nextX = Math.max(0, Math.round(start.x + dragDelta.dx));
                  const nextY = Math.max(0, Math.round(start.y + dragDelta.dy));
                  markPadletLocallyModified(padletId);
                  const result = await updatePostPosition({ postId: padletId, positionX: nextX, positionY: nextY }, { userId: null });
                  if (!result.ok) throw result.error.cause ?? result.error;
                })
              );
            } catch (err) {
              console.error('Failed to save grouped padlet positions:', err);
              fetchData();
            }
          }
          draggingPadletIdsRef.current = [];
          setIsDragging(false);
          setDraggingPadletId(null);
          return;
        }

        const draggedPadlet = padlets.find(p => p.id === currentDraggingId);
        if (!draggedPadlet) {
          lastDragPositionRef.current = null;
          draggingPadletIdsRef.current = [];
          setIsDragging(false);
          setDraggingPadletId(null);
          return;
        }

        const containers = padlets.filter(p => p.type === 'container' && p.id !== currentDraggingId && !p.metadata?.parentId);
        let droppedOnContainer: typeof containers[0] | null = null;

        for (const container of containers) {
          const containerLeft = container.position_x || 0;
          const containerTop = container.position_y || 0;
          const containerWidth = 280;
          const containerHeight = 200;

          if (
            lastMousePosition.x >= containerLeft &&
            lastMousePosition.x <= containerLeft + containerWidth &&
            lastMousePosition.y >= containerTop &&
            lastMousePosition.y <= containerTop + containerHeight
          ) {
            droppedOnContainer = container;
            break;
          }
        }

        if (droppedOnContainer) {
          lastDragPositionRef.current = null;
          const childIds = droppedOnContainer.metadata?.childPadletIds || [];
          if (!childIds.includes(currentDraggingId)) {
            const newChildIds = [...childIds, currentDraggingId];
            try {
              markPadletLocallyModified(droppedOnContainer.id);
              markPadletLocallyModified(currentDraggingId);

              const updatePostMetadataBestEffort = createUpdatePostMetadataBestEffortCommand(createPostsRepository());
              const containerResult = await updatePostMetadataBestEffort({ postId: droppedOnContainer.id, metadata: { ...droppedOnContainer.metadata, childPadletIds: newChildIds } }, { userId: null });
              if (!containerResult.ok) throw containerResult.error.cause ?? containerResult.error;

              const newMetadata = { ...draggedPadlet.metadata, parentId: droppedOnContainer.id };
              const draggedResult = await updatePostMetadataBestEffort({ postId: currentDraggingId, metadata: newMetadata }, { userId: null });
              if (!draggedResult.ok) throw draggedResult.error.cause ?? draggedResult.error;

              setPadlets(prev => prev.map(p => {
                if (p.id === droppedOnContainer!.id) {
                  return { ...p, metadata: { ...p.metadata, childPadletIds: newChildIds } };
                }
                if (p.id === currentDraggingId) {
                  return { ...p, metadata: newMetadata };
                }
                return p;
              }));

              fetchData();
            } catch (err) {
              console.error('Failed to add padlet to container:', err);
            }
          }
        } else {
          const finalPos = lastDragPositionRef.current;
          lastDragPositionRef.current = null;
          if (finalPos) {
            const committedX = Math.round(finalPos.x);
            const committedY = Math.round(finalPos.y);
            markPadletLocallyModified(currentDraggingId);
            try {
              const updatePostPosition = createUpdatePostPositionCommand(createPostsRepository());
              const result = await updatePostPosition({ postId: currentDraggingId, positionX: committedX, positionY: committedY }, { userId: null });
              if (!result.ok) {
                throw result.error.cause ?? result.error;
              }
            } catch (err) {
              console.error('Failed to save padlet position:', err);
            }
          }
        }
      }
      debugCanvasLogger('dragEnd', { padletId: currentDraggingId });
      draggingPadletIdsRef.current = [];
      dragSelectionStartPositionsRef.current = {};
      lastDragDeltaRef.current = null;
      setIsDragging(false);
      setDraggingPadletId(null);
    } finally {
      dragEndInFlightRef.current = false;
      unlockBodySelection();
    }
  };

  useEffect(() => {
    handleCanvasMouseUpRef.current = () => {
      handleCanvasMouseUp();
    };
  });

  useEffect(() => {
    if (!canEditCanvas) return;
    const handleWindowMouseUp = () => {
      handleCanvasMouseUpRef.current();
    };
    window.addEventListener('mouseup', handleWindowMouseUp);
    window.addEventListener('pointerup', handleWindowMouseUp);
    window.addEventListener('blur', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleWindowMouseUp);
      window.removeEventListener('pointerup', handleWindowMouseUp);
      window.removeEventListener('blur', handleWindowMouseUp);
    };
  }, [canEditCanvas]);


  return {
    isDragging,
    setIsDragging,
    dragOffset,
    setDragOffset,
    draggingPadletId,
    setDraggingPadletId,
    lastMousePosition,
    setLastMousePosition,
    handlePadletMouseDown,
    handleImagePadletDrag,
    handleCanvasMouseMove,
    handleCanvasMouseUp,
  };
}
```

## 3. The edit recipe (five regions — §2 is authoritative if any doubt)

### §3a — import swap (current L4)

OLD:

```ts
import { supabaseBrowser } from '@/lib/supabase/browser';
```

NEW:

```ts
import {
  createUpdatePostMetadataBestEffortCommand,
  createUpdatePostPositionCommand,
} from '@/lib/domain/canvas/posts';
import { createPostsRepository } from '@/lib/infra/canvas/postsRepository';
```

### §3b — dead client creation removed (current L54–L56, 3 lines → 0)

OLD:

```ts
  // Cookie-authenticated client — see useCanvasData.ts for why this must match
  // supabaseBrowser() rather than the plain lib/supabase.ts singleton.
  const supabase = supabaseBrowser();
```

NEW: (nothing — the lines are deleted.)

### §3c — grouped-drag batch (the 9 statement lines inside the map → 2, +1 instantiation before the batch)

OLD (interior of the `Promise.all` map, after `markPadletLocallyModified(padletId);`):

```ts
                  const { error } = await supabase
                    .from('padlets')
                    .update({
                      position_x: nextX,
                      position_y: nextY,
                      updated_at: new Date().toISOString(),
                    })
                    .eq('id', padletId);
                  if (error) throw error;
```

NEW (plus `const updatePostPosition = createUpdatePostPositionCommand(createPostsRepository());` inserted directly after the `try {` above the batch):

```ts
                  const result = await updatePostPosition({ postId: padletId, positionX: nextX, positionY: nextY }, { userId: null });
                  if (!result.ok) throw result.error.cause ?? result.error;
```

### §3d — drop-into-container pair (the two bare-awaited writes → command pair with cause-unwrap throws)

OLD:

```ts
              await supabase
                .from('padlets')
                .update({
                  metadata: { ...droppedOnContainer.metadata, childPadletIds: newChildIds },
                  updated_at: new Date().toISOString(),
                })
                .eq('id', droppedOnContainer.id);

              const newMetadata = { ...draggedPadlet.metadata, parentId: droppedOnContainer.id };
              await supabase
                .from('padlets')
                .update({
                  metadata: newMetadata,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', currentDraggingId);
```

NEW:

```ts
              const updatePostMetadataBestEffort = createUpdatePostMetadataBestEffortCommand(createPostsRepository());
              const containerResult = await updatePostMetadataBestEffort({ postId: droppedOnContainer.id, metadata: { ...droppedOnContainer.metadata, childPadletIds: newChildIds } }, { userId: null });
              if (!containerResult.ok) throw containerResult.error.cause ?? containerResult.error;

              const newMetadata = { ...draggedPadlet.metadata, parentId: droppedOnContainer.id };
              const draggedResult = await updatePostMetadataBestEffort({ postId: currentDraggingId, metadata: newMetadata }, { userId: null });
              if (!draggedResult.ok) throw draggedResult.error.cause ?? draggedResult.error;
```

### §3e — single-drag commit

OLD:

```ts
              const { error } = await supabase
                .from('padlets')
                .update({
                  position_x: committedX,
                  position_y: committedY,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', currentDraggingId);
              if (error) {
                throw error;
              }
```

NEW:

```ts
              const updatePostPosition = createUpdatePostPositionCommand(createPostsRepository());
              const result = await updatePostPosition({ postId: currentDraggingId, positionX: committedX, positionY: committedY }, { userId: null });
              if (!result.ok) {
                throw result.error.cause ?? result.error;
              }
```

---

## 7. Post-edit gates (hash FIRST; any mismatch = STOP)

### 7.0 Byte-identity (PRIMARY — computed from the CTO's simulation)

```bash
git hash-object components/collabboard/canvas/hooks/useCanvasInteractions.ts   # 0e55b8e71e16f3e5416120fa0a69ce8c810ec065
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx"   # 57a56ef8595c8ebc4b655a1fd811904049bbd155   (MUST-NOT-CHANGE)
git hash-object lib/domain/canvas/posts.ts                     # 9d64acb5d9660c20e6b06f86e7339edee2810a03   (MUST-NOT-CHANGE)
git hash-object lib/infra/canvas/postsRepository.ts             # 7af06d87042c7a378d73c9943f11e4eb53d2392d   (MUST-NOT-CHANGE)
git ls-files --eol -- components/collabboard/canvas/hooks/useCanvasInteractions.ts
# i/lf    w/lf
```

### 7.1 Hook census (simulation-measured)

```bash
H="components/collabboard/canvas/hooks/useCanvasInteractions.ts"
wc -l "$H"                                # 489
grep -c '^[[:space:]]*$' "$H"             # 55
grep -c "\.from('padlets')" "$H"          # 0   (EXTINCTION)
grep -c "supabase" "$H"                   # 0   (the hook is supabase-FREE)
grep -c "markPadletLocallyModified" "$H"  # 6   (the realtime-suppression cache — byte-kept)
grep -c "createUpdatePostPositionCommand" "$H"           # 3   (1 import + 2 uses)
grep -c "createUpdatePostMetadataBestEffortCommand" "$H" # 2   (1 import + 1 use)
grep -c "createPostsRepository" "$H"      # 4   (1 import + 3 uses)
grep -c "result.error.cause" "$H"         # 2
grep -c "userId: null" "$H"               # 4
```

### 7.2 Scope + untouched gates

```bash
git status --short   # exactly ONE modified file: the hook; ANY other path = STOP
git diff -- components/collabboard/canvas/hooks/useCanvasData.ts components/collabboard/canvas/hooks/useCanvasLines.ts   # nothing
git diff -- lib/domain lib/infra "app/dashboard/canvas/\[id\]/CanvasClient.tsx" eslint.boundaries.config.mjs             # nothing
grep -c "CanvasClient.tsx'\|FreeformPadletCards.tsx'" eslint.boundaries.config.mjs   # 2 (grandfather 2→2, untouched)
```

---

## 8. Verification sequence

**Phase A (before any edit):** port gate `(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count` → 0; own dev server; warm `/`, `/auth`, `/dashboard` with plain `curl -sS -o /dev/null` GETs; full Playwright → **27 passed** (cold-start rerun rule applies); §1 gates.

**Phase B:** implement §2 (whole file; §3 is the recipe), then §7 gates (hash first).

**Phase C:** `npx tsc --noEmit` clean (stale `.next/types` rule applies); `npm run check:boundaries` → no output; `npx vitest run` → **201 passed (201), 25 files** (unchanged — zero test changes); full Playwright warmed → **27 passed** (board-lifecycle exercises the drag-commit paths); stop own server (PID-attributed) + port gate → 0; `rm -rf .next`; `npm run verify` all green.

## 9. Commit ritual

```bash
git add components/collabboard/canvas/hooks/useCanvasInteractions.ts
git status --short   # exactly 1 staged M line; anything else = STOP
git commit -m "refactor(canvas): extract the drag-commit family in useCanvasInteractions onto the existing command quartet -- hook goes supabase-free, hooks phase opener, Pattern K (PATCH-038)" -- components/collabboard/canvas/hooks/useCanvasInteractions.ts
```

## 10. Full-disclosure rule + STOP conditions

Report EVERY deviation: whitespace, comments, blank lines, EOL bytes,
import order, renamed locals, casts, message strings, test counts.
Pre-declared (confirm, don't re-justify): the dead-client removal
(§3b — deletions-only, `supabase` census 7→0); the command-internal
`updated_at` stamps (§0.3, established 032+); the batch instantiation
(ONE command instance before `Promise.all`, the 032 idiom); wc 509→489;
ZERO new casts; ZERO test changes; NO authorized behavior change
anywhere (§0.4 — the single-commit site needs none, both legacy
channels already converged).

STOP if: any §1 gate mismatches; any OLD text from §3 fails byte-match;
the §7.0 hash mismatches after one fix attempt against the §2 fence;
`git status --short` shows ANY path beyond the one scoped file; any
MUST-NOT-CHANGE hash moved; tsc/boundaries/unit/e2e fail beyond the
stale-`.next/types` cure.

Do NOT: touch useCanvasData, useCanvasLines, CanvasClient, any domain or
infra file, or the realtime channel; "fix" the empty catches elsewhere
in the hooks (Families 1–5 are deferred BY NAME, §0.1); create files;
de-lint types; chase the grandfather list (stays 2).
