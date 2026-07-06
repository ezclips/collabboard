# Component Guidelines

How React components are structured in Fable 5. Written against the specific failure modes this codebase has already exhibited.

## 1. The Failure Mode We Are Escaping

`CanvasClient.tsx` (8,526 lines) and `FreeformPadletCards.tsx` (6,368 lines) grew because components were allowed to own **data access + sync + interaction logic + rendering for every layout at once**. The fix is not "split big files" — it is the layered architecture (ARCHITECTURE.md §2). These guidelines are the day-to-day enforcement of that architecture.

## 2. Component Tiers

```
app/**            Route shells: fetch snapshot (RSC), mount engine. Thin.
engine/           BoardCanvas, SelectionLayer, PresenceLayer, CommentLayer — layout-agnostic
layouts/<name>/   LayoutPlugin implementations — pure projections of the store
blocks/<type>/    Block renderer + editor per block type (text, todo, table, …)
ui/               Design-system primitives (Radix + CVA). No domain imports.
```

### The LayoutPlugin contract (the extensibility moat)

```ts
interface LayoutPlugin {
  id: LayoutId;                                   // 'wall' | 'timeline' | 'map' | …
  Surface: React.ComponentType<LayoutSurfaceProps>; // renders placements
  placementCodec: {                                // placement props <-> typed model
    schema: z.ZodType<PlacementProps>;
    defaultFor(post: Post, ctx: LayoutContext): PlacementProps;
  };
  dnd?: LayoutDndAdapter;                          // maps drops -> ops
  capabilities: { sections: boolean; freePosition: boolean; zoom: boolean };
}
```

Registered in a `LayoutRegistry` (copy the proven pattern from `lib/ai/mode-registry.ts`). The engine renders `registry.get(board.activeLayout).Surface`. **Adding a layout = adding a folder.** No engine edits, no `switch (layout)` anywhere.

## 3. Hard Rules

1. **No data access in components.** No `supabase` import outside `lib/infra`; components call store selectors + command hooks. (ESLint-enforced.)
2. **Size ceilings:** component file ≤ 400 lines; any file ≤ 800 (repo standard). Touched files over the ceiling must shrink or split in the same PR.
3. **One implementation per concern (P6):** one comment thread component, one post card shell, one modal pattern, one DnD abstraction (`@dnd-kit` — already standard). The three comment UIs and two post-card stacks converge in Phase 3; new code must use the designated survivor.
4. **Props down, ops up.** Interactive components emit domain ops (`onOp(movePost(...))`), never raw setters into parent state.
5. **No copy-paste layout forks.** If two layouts need similar behavior, it moves into the engine or a shared hook — never a second 900-line sibling (the `components/canvas` vs `components/collabboard` split must not happen again).
6. **Colocation:** `layouts/timeline/{TimelineSurface.tsx, codec.ts, dnd.ts, hooks.ts, index.ts}` — feature folders, not type folders.

## 4. Rendering Discipline (canvas-specific)

- **Virtualize every unbounded list/grid** (wall, columns, rows): render only placements in/near the viewport. This is Miro's core lesson and our biggest perf lever (PERFORMANCE.md).
- Post cards subscribe to **their own post's slice** of the store (per-entity selector), so one post edit re-renders one card — not the board tree. This is the main argument for the store model in STATE_MANAGEMENT.md.
- Spatial surfaces (freeform, map) render chrome in React but hot-path geometry (drag ghosting, selection marquee, connectors) via transform-only updates outside React state.
- `React.memo` on card components with stable op-callback identities (from the store, not inline closures).

## 5. Editors

Block editors (`NoteEditor`, `TodoEditor`, `TableEditor`, … currently 1,000–1,500 lines each in `components/collabboard/editors/`) follow one shape: `Editor({ block, onOp })`, internal draft state, commit-on-blur/debounce via ops. TipTap configuration is shared from one `lib/editor/extensions.ts` — today each editor re-declares its extension stack.

## 6. Definition of Done for a Component PR

- [ ] No new direct DB/network calls in components
- [ ] File-size ceilings respected on touched files
- [ ] Renders correctly with 0, 1, and 500 items (virtualization not broken)
- [ ] Keyboard path exists (ACCESSIBILITY.md)
- [ ] No new `useState` where the value belongs in the BoardStore (STATE_MANAGEMENT.md decision table)
- [ ] Storybook-style fixture or Playwright coverage for the new surface (TESTING.md)
