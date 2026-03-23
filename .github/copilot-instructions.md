# Copilot Project Instructions

## Component File Size Rules

### Hard Limits

| Metric | Limit |
|--------|-------|
| **Max lines per React component file** | 500 |
| **Max lines per hook file** | 500 |
| **Max props on a single component** | 30 |

These limits apply to all `.tsx` and `.ts` files under `app/`, `components/`, and `hooks/`.

### Known Exceptions (Legacy)

The following files exceed limits due to ongoing decomposition. They must **never grow** — only shrink:

| File | Current lines | Direction |
|------|--------------|-----------|
| `app/dashboard/canvas/[id]/CanvasClient.tsx` | ~5,039 | ↓ shrink only |
| `components/collabboard/canvas/ui/FreeformPadletCards.tsx` | ~4,992 | ↓ shrink only |
| `hooks/canvas/usePadletSave.ts` | ~1,043 | ↓ shrink only |

### What to Do When a File Approaches the Limit

1. **Extract a custom hook** — if logic (state + effects + callbacks) is cohesive, move it to `components/collabboard/canvas/hooks/` or `hooks/canvas/`.
2. **Extract a child component** — if JSX + its handlers form a self-contained UI block, create a new file in the appropriate `ui/` folder. The component must *own its content* (no thin `{children}` wrappers that just pass through).
3. **Extract pure functions** — if computation is side-effect-free, move to `components/collabboard/canvas/engine/` or a relevant `lib/` module.
4. **Extract constants/types** — move shared constants to `store/types.ts` or a dedicated constants file.

### Rules for New Code in CanvasClient.tsx

- **Never add new JSX blocks** directly to CanvasClient. Create or extend a child component in `ui/`.
- **Never add new inline `supabase.from()` calls**. Use or create a persistence helper in `hooks/canvas/` or `lib/`.
- **Never add new state variables** without first checking if they belong in an existing hook or the canvas store (`store/canvasReducer.ts`).
- **Never duplicate constants** (color arrays, DnD kind strings, etc.) — import from the component that owns them or move to a shared constants file.
- **Prefer typed Props interfaces** over long chains of individual prop drilling when extracting components. If a component needs >30 props, it is a sign it should be split further.

### Decomposition Architecture Reference

```
CanvasClient.tsx (orchestrator — wires hooks + renders layout shells)
├── store/       — useReducer state (types, actions, reducer, selectors)
├── hooks/       — custom hooks (data, camera, selection, interactions, lines, shortcuts, overlays)
├── engine/      — pure functions (geometry, hitTest, utils, zIndex, graph)
├── ui/          — content-owning UI components (modals, overlays, freeform cards, shells)
└── hooks/canvas/usePadletSave.ts — padlet CRUD batching
```

When adding a new feature to the canvas:
1. State → add to store or existing hook
2. Logic → add to engine or new hook
3. UI → add to existing or new `ui/` component
4. Persistence → add to usePadletSave or a new persistence hook
5. CanvasClient → only wire the pieces together (import hook, pass props to component)

---

## General Coding Standards

- Use TypeScript strict mode — no `any` unless legacy code requires it.
- Prefer named exports for components and hooks.
- Use `useCallback` and `useMemo` for functions/values passed as props.
- Keep Supabase calls out of component render paths — use hooks or lib functions.
- All new components must have a typed Props interface (no implicit `any` props).
