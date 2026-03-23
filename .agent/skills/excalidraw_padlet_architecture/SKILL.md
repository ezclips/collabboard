---
name: Excalidraw Padlet Integration Architecture
description: Deep dive into the padlet:// protocol, React-in-Excalidraw bridge (renderEmbeddable), and the drop zone architecture for containers.
---

# How Padlets Are Integrated into Excalidraw (The Full System)

This is the core architecture that makes padlets render inside Excalidraw as interactive embeddables.

### Concept: padlet:// Protocol

Every padlet on a Drawing canvas becomes an Excalidraw **embeddable element** with `link: "padlet://<padletId>"`.
Excalidraw renders a React component inside the embeddable frame when `validateEmbeddable` returns true.

```
Padlet DB record
  └── id: "abc123"
  └── type: "container" | "note" | "image" | etc.
  └── position_x, position_y, width, height

Excalidraw scene element
  └── type: "embeddable"
  └── link: "padlet://abc123"       <-- the bridge
  └── x, y, width, height           <-- canvas coordinates
```

### Step 1: validateEmbeddable — Whitelist the Protocol

On the `ExcalidrawWrapper` component:

```tsx
validateEmbeddable={(link: string) => link.startsWith('padlet://')}
```

Without this, Excalidraw rejects the link and shows a broken iframe instead of your component.

### Step 2: renderEmbeddable — React Inside Excalidraw

Excalidraw calls this callback to get the React tree to render inside each embeddable frame.

```tsx
const renderEmbeddable = useCallback((element: any) => {
  const link = typeof element?.link === "string" ? element.link : "";
  if (!link.startsWith("padlet://")) return null;

  const padletId = link.replace("padlet://", "");
  const padlet = padlets.find((p) => String(p.id) === padletId && p.type !== "drawing");
  if (!padlet) return null;

  // Determine if this padlet renders as a container (card list) or a single card
  const md = padlet.metadata as any;
  const isContainer =
    md?.isContainer === true ||
    (md?.childPadletIds && md.childPadletIds.length > 0) ||
    padlet.type === "container";

  return (
    <div className="w-full h-full overflow-hidden rounded-xl bg-white flex flex-col">
      {/* Drag strip (28px tall for containers, 14px for cards) */}
      <div ... onPointerDown={...} />          {/* custom drag-to-move */}
      {/* Content area */}
      <div onPointerDown={(e) => e.stopPropagation()}>
        {isContainer
          ? <RowColumnContainerCard padlet={padlet} allPadlets={padlets} ... />
          : <PostCardContent padlet={padlet} ... />
        }
      </div>
    </div>
  );
}, [fetchData, handleContextMenu, padlets, onUpdatePadlet, onAddPadlet, canvasId]);
```

Key rules for `renderEmbeddable`:
- Return `null` to render nothing (Excalidraw will show an empty frame)
- `onPointerDown={(e) => e.stopPropagation()}` on the content area is REQUIRED — without it, any
  click inside the content (text, buttons, inputs) triggers Excalidraw's drag/select
- `excalidrawAPI` must NOT be in deps — use `excalidrawAPIRef.current` instead

### Step 3: createEmbeddableElementForPadlet — Making the Scene Element

Converts a padlet DB record into an Excalidraw scene element:

```tsx
const createEmbeddableElementForPadlet = useCallback((padlet: Padlet) => {
  return {
    id: crypto.randomUUID(),
    type: "embeddable" as const,
    x: padlet.position_x,
    y: padlet.position_y,
    width: padlet.width ?? 320,
    height: padlet.height ?? 280,
    angle: 0,
    strokeColor: "transparent",
    backgroundColor: "transparent",
    fillStyle: "solid" as const,
    strokeWidth: 1,
    strokeStyle: "solid" as const,
    roundness: null,
    roughness: 0,
    opacity: 100,
    seed: Math.floor(Math.random() * 2000000000),
    version: 1,
    versionNonce: Math.floor(Math.random() * 1e9),
    index: null,
    isDeleted: false,
    groupIds: [],
    frameId: null,
    boundElements: null,
    updated: Date.now(),
    link: `padlet://${padlet.id}`,   // <-- the bridge
    locked: false,
  };
}, []);
```

### Step 4: Syncing Padlets -> Embeddables on Load

When the Excalidraw API is ready OR when padlets change, this `useEffect` adds any missing embeddables:

```tsx
useEffect(() => {
  if (!excalidrawAPI) return;

  // Only root padlets (not children of containers, not the master drawing padlet)
  const nonDrawingRootPadlets = padlets.filter(
    (p) => p.type !== "drawing" && !p.metadata?.parentId
  );
  if (nonDrawingRootPadlets.length === 0) return;

  const currentElements = excalidrawAPI.getSceneElements();
  const existingLinks = new Set(
    currentElements
      .filter((el: any) => el.type === "embeddable" && !el.isDeleted && typeof el.link === "string")
      .map((el: any) => el.link)
  );

  // Only add embeddables that don't already exist in the scene
  const missingEmbeddables = nonDrawingRootPadlets
    .filter((p) => !existingLinks.has(`padlet://${p.id}`))
    .map((p) => createEmbeddableElementForPadlet(p));

  if (missingEmbeddables.length === 0) return;

  excalidrawAPI.updateScene({
    elements: [...currentElements, ...missingEmbeddables],
    commitToHistory: false,   // don't pollute undo history on initial load
  });
}, [createEmbeddableElementForPadlet, excalidrawAPI, padlets]);
```

### Step 4b: Arrow Binding on Padlet Container Drag

When a user drags a padlet container by its top strip, Excalidraw's restriction on dragging HTML elements is bypassed using a custom pointer capture loop (`handleMove` / `handleUp` in `DrawingLayout.tsx`).

Because this manually sets the element x/y coordinates and merges them back via `updateScene(elements)`, Excalidraw's internal engine does **not** recalculate the `boundElements` positions (the arrows attached to it). 

To fix this, we exposed Excalidraw's native function `updateBoundElements` on the imperative API and call it during the manual pointer drag loop:

```tsx
// Inside DrawingLayout.tsx `handleMove` and `handleUp`
excAPI.updateScene({ elements: newElements, commitToHistory: false });

if (typeof (excAPI as any).updateBoundElements === 'function') {
  (excAPI as any).updateBoundElements(updatedSceneEl);
}
```
*Note: We patched `packages/excalidraw/components/App.tsx`, `packages/excalidraw/types.ts`, and the compiled `dist/dev/index.js` to expose `updateBoundElements`.*

### Step 5: insertPadletEmbeddable — Adding a Single New Padlet

When a padlet is created (e.g., from context menu > Duplicate), call this to inject its
embeddable immediately without waiting for the next padlets state update:

```tsx
const insertPadletEmbeddable = useCallback((padlet: Padlet) => {
  if (!excalidrawAPI) return;
  if (padlet.type === "drawing") return;       // master padlet has no embeddable
  if (padlet.metadata?.parentId) return;       // children are inside containers, not root canvas

  const currentElements = excalidrawAPI.getSceneElements();
  const link = `padlet://${padlet.id}`;

  // Guard: don't add duplicate
  const alreadyExists = currentElements.some(
    (el: any) => el.type === "embeddable" && !el.isDeleted && el.link === link
  );
  if (alreadyExists) return;

  const embeddable = createEmbeddableElementForPadlet(padlet);
  excalidrawAPI.updateScene({
    elements: [...currentElements, embeddable],
    appState: { ...excalidrawAPI.getAppState() },
    commitToHistory: true,
  });
}, [createEmbeddableElementForPadlet, excalidrawAPI]);
```

This is passed as `onPadletCreated` to `useCanvasActions`.

### Step 6: Deleting Padlets When Embeddable is Deleted

In `handleChange`, when Excalidraw marks an embeddable as deleted, the padlet DB record is deleted:

```tsx
// Inside handleChange loop:
} else if (onDeletePadlet && el.type === "embeddable" && typeof el.link === "string" && el.link.startsWith("padlet://")) {
  if (!deletedEmbeddables) deletedEmbeddables = [];
  deletedEmbeddables.push(el);
}

// After loop:
if (deletedEmbeddables) {
  deletedEmbeddables.forEach((el: any) => {
    const padletId = String(el.link).replace("padlet://", "");
    if (!padletId || deletedEmbeddablePadletIdsRef.current.has(padletId)) return;
    deletedEmbeddablePadletIdsRef.current.add(padletId);  // dedup guard
    onDeletePadlet(padletId).catch(console.error);
  });
}
```

`deletedEmbeddablePadletIdsRef` prevents double-deletes when Excalidraw fires onChange
multiple times for the same deletion.

### Step 7: Drawing New Containers with Excalidraw's Container Tool

When a user draws a new **unbound embeddable** using Excalidraw's built-in container tool
(an embeddable with `el.link === null`), `handleChange` intercepts it and creates a padlet:

```tsx
// Detected inside handleChange:
if (el.type === "embeddable" && !el.link) {
  unboundEmbeddable = el;
}

// After loop:
if (unboundEmbeddable && !createdContainerEmbeddableIdsRef.current.has(unboundEmbeddable.id)) {
  createdContainerEmbeddableIdsRef.current.add(unboundEmbeddable.id);

  const initializeContainerPadlet = async () => {
    const newPadlet = await onAddPadlet({
      board_id: canvasId,
      type: 'container',
      title: 'New Container',
      content: '[]',
      position_x: unboundEmbeddable.x,
      position_y: unboundEmbeddable.y,
      width: unboundEmbeddable.width,
      height: unboundEmbeddable.height,
      metadata: { isContainer: true },
    });

    if (newPadlet && excalidrawAPI) {
      // Bind the embeddable to the new padlet by setting its link
      excalidrawAPI.updateScene({
        elements: excalidrawAPI.getSceneElements().map((el: any) =>
          el.id === unboundEmbeddable.id
            ? { ...el, link: `padlet://${newPadlet.id}` }
            : el
        ),
      });
    }
  };
  initializeContainerPadlet();
}
```

`createdContainerEmbeddableIdsRef` is a Set that prevents re-creating the padlet if
`handleChange` fires multiple times before the async create completes.

### Container Detection Logic

A padlet is treated as a container (renders `RowColumnContainerCard`) if ANY of:
```tsx
const isContainer =
  md?.isContainer === true ||                          // created via "New Container" button
  (md?.childPadletIds && md.childPadletIds.length > 0) ||  // has children already
  padlet.type === "container";                         // type field explicitly set
```

### Drop Zone Architecture

Containers have a two-layer drop zone:

**Inner drop zone** — `RowColumnContainerCard`'s `<div className="space-y-2">`:
- Handles drops of existing padlets (`text/padlet-id`)
- Handles drops of library items (`application/collabboard-library`, `application/json`, etc.)
- Calls `e.stopPropagation()` so drops don't bubble to outer layer

**Outer drop zone** — the `renderEmbeddable` wrapper div:
- `onDragOver` + `onDrop` only on container padlets (`isContainer ? ... : undefined`)
- Catches drops that land on the header/strip area not covered by inner zone
- Only handles `application/collabboard-library` (inner zone already handles the rest)

```tsx
onDrop={isContainer ? async (e) => {
  const libPayload = e.dataTransfer.getData('application/collabboard-library');
  if (!libPayload) return;
  e.preventDefault();
  e.stopPropagation();
  // create child padlet + update container's childPadletIds
} : undefined}
```

### Child Padlet Relationship

A padlet is "inside" a container when:
1. Its `metadata.parentId` = the container's `id`  -- excludes it from the root canvas
2. Container's `metadata.childPadletIds` includes the child's `id` -- controls render order

Both must stay in sync. When adding a child:
```ts
// 1. Create child with parentId
await onAddPadlet({ ..., metadata: { parentId: containerId } });

// 2. Update container's childPadletIds
await onUpdatePadlet(containerId, {
  metadata: { ...container.metadata, childPadletIds: [...existing, child.id] }
});
```

`parentId` gates the sync `useEffect` (step 4 above) from adding a root embeddable for the child.

---

## Fixed container badge styling and alignment

- **Badge Styling**: Replaced Tailwind `bg-gray-100` with inline `style={{ backgroundColor: '#f3f4f6', color: '#4b5563' }}` in `RowColumnContainerCard.tsx`. This avoids CSS scope issues inside the Excalidraw iframe where Tailwind utility classes might not be fully loaded.
- **Container Alignment**: Added `w-full` to both `DrawingLayout.tsx` (inner scroll div) and `RowColumnContainerCard.tsx` (root div). This ensures the HTML container card always fills the full width of its Excalidraw embeddable bounding box, fixing left-offset alignment issues and ensuring arrow connection points are visually accurate.

---

## Arrow Binding to Padlet Containers

- **Mechanical Binding**: Arrow binding to padlet containers is mechanically functional at the Excalidraw engine level. Arrows correctly set their `startBinding`/`endBinding` to the container's ID, and the container's internal `boundElements` array includes the arrow. When dragging the container on the canvas, any bound arrows correctly follow it.
- **Pointer Events Patch**: To allow the Excalidraw engine to detect the container as a binding target during arrow creation, `App.tsx` (and `dist/dev/index.js`) is patched to apply `pointer-events: none` to the embeddable's inner `div` when `activeTool.type === "arrow"` or `"line"`. This lets exact pointer coordinates "fall through" the HTML overlay to the interactive `<canvas>`.
- **Visual Feedback Limitations**: Excalidraw draws binding visual indicators (the glowing blue highlight on hover, and the filled blue circle on the arrow endpoint) directly on the interactive `<canvas>`. Because the padlet is rendered as an HTML `<div>` floating above the canvas (`z-index: 2` in `.excalidraw__embeddable-container`), it visually obscures these indicators. Thus, the mechanical binding works, but the user sees a hollow circle (unbound visual state) because the true filled circle is rendered underneath the HTML layer.

---

## File Locations

| File | What Changed |
|------|-------------|
| `components/collabboard/canvas/layouts/DrawingLayout.tsx` | Added `excalidrawAPIRef`, updated API setter, replaced passive strip with active drag handler |
| `app/dashboard/canvas/[id]/CanvasClient.tsx` | Added stacking-prevention loop in `handleDrawingNewContainer`, added `padlets` to deps |

---

## Architecture Notes

- `appStateRef` is updated on every `handleChange` call (60fps during drag) — always current
- `excalidrawAPIRef` is set at the same time as `setExcalidrawAPI` — always current
- Strip height rules: `stripColor ? '10px' : (isContainer ? '28px' : '14px')`
  - Colored strip = thin decorative bar (10px)
  - Container without color = taller grab bar (28px) — gives more drag surface
  - Regular padlet without color = medium bar (14px)
- `commitToHistory: false` during move prevents the undo stack from exploding
- `setPointerCapture` is essential — without it, moving the cursor fast outside the strip
  loses events and the drag stops mid-way
