---
name: CanvasClient Refactoring & Decomposition
description: Architecture and timeline of the CanvasClient.tsx monolithic decomposition (PR1–PR12), including new folder structure and file size guard policies.
---

# CanvasClient.tsx Decomposition (PR1–PR12)

## Overview

`CanvasClient.tsx` was decomposed from a monolithic 12,057-line file down to **5,039 lines** (58% reduction). The functionality was split into specialized hooks, engine utilities, and UI components.

## Architecture After Decomposition

```
CanvasClient.tsx (orchestrator)
├── Store (useReducer)
│   ├── store/types.ts
│   ├── store/actions.ts
│   ├── store/canvasReducer.ts
│   └── store/selectors.ts
├── Hooks
│   ├── hooks/useCanvasData.ts — data fetching, realtime, auth
│   ├── hooks/useCanvasInteractions.ts — drag, resize, click handlers
│   ├── hooks/useCanvasOverlays.ts — popups, tooltips, context menus
│   ├── hooks/useCanvasLines.ts — line drawing, selection, persistence
│   ├── hooks/useCanvasShortcuts.ts — keyboard shortcuts
│   ├── hooks/useCanvasSelection.ts — selection management
│   ├── hooks/useCanvasCamera.ts — zoom, pan
│   └── hooks/canvas/usePadletSave.ts — padlet CRUD + batching
├── Engine (pure functions)
│   ├── engine/geometry.ts
│   ├── engine/hitTest.ts
│   ├── engine/utils.ts
│   ├── engine/zIndex.ts
│   └── engine/graph.ts
└── UI Components
    ├── ui/FreeformPadletCards.tsx — all freeform layout card rendering
    ├── ui/CanvasModals.tsx — editor modals
    ├── ui/OverlayLayer.tsx — popups and context menus
    ├── ui/KanbanShell.tsx
    ├── ui/GanttShell.tsx
    ├── ui/ZoomControls.tsx
    └── etc.
```

## Key Design Decisions

1. **Horizontal vs Vertical Splitting**: The 4,700-line freeform block was extracted as a single component (`FreeformPadletCards.tsx`) with ~80 props. While large, this significantly reduced `CanvasClient.tsx` complexity while maintaining safe prop-passing.
2. **Content Ownership**: Components like `CanvasModals` and `OverlayLayer` own their JSX content, which drove the majority of the line reduction.
3. **Ref-based State for Handlers**: Many interaction hooks use refs to avoid stale closure issues in stable event listeners.

## File Size Guard

A `.github/copilot-instructions.md` rule was added to enforce a **500-line hard cap** on any single React component file to prevent regression into monolithic structures.

---
