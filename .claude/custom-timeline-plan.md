# Custom Timeline Canvas Implementation Plan

## Overview

Replace react-chrono with a custom timeline component. Same props interface, pure Tailwind styling, native scroll.

**Files to modify:**
- `components/canvas/ChronoTimelineCanvas.tsx` - Replace with custom implementation
- `app/globals.css` - Remove `.chrono-isolation` rules (lines 581-644)
- `components/canvas/ChronoWrapper.tsx` - Delete (no longer needed)

**Props interface (keep unchanged):**
```tsx
interface TimelineCanvasProps {
  padlets: Padlet[];
  canvasId: string;
  chronoMode: ChronoMode; // 'vertical' | 'horizontal' | 'alternating' | 'horizontal-all'
  backgroundStyle?: React.CSSProperties;
  isEditable?: boolean;
  onOpenContainer: (container: Padlet) => void;
  onDeleteContainer?: (containerId: string) => void;
  onCreateEmptyContainer?: () => void;
}
```

---

## Section 1: Create Custom TimelineCanvas with Vertical Layout

**Goal:** Replace Chrono with custom vertical timeline

**Structure:**
```
<div> // outer container, flex col, h-full
  <Toolbar /> // fixed height
  <div> // scroll container, flex-1, overflow-y-auto
    <div> // timeline content with left line
      {items.map(item => <TimelineItem />)}
    </div>
  </div>
</div>
```

**TimelineItem for vertical mode:**
```tsx
<div className="relative pl-8 pb-8">
  {/* Vertical line */}
  <div className="absolute left-[5px] top-0 bottom-0 w-0.5 bg-gray-300" />

  {/* Dot */}
  <div className="absolute left-0 top-0 w-3 h-3 rounded-full bg-blue-500 border-2 border-white" />

  {/* Date badge */}
  <div className="inline-block px-2 py-1 mb-2 text-xs font-medium text-white bg-blue-500 rounded">
    {date}
  </div>

  {/* Card */}
  <div
    className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 cursor-pointer hover:shadow-md"
    data-container-id={container.id}
    onClick={() => onOpenContainer(container)}
  >
    <h3 className="font-semibold text-blue-600">{title}</h3>
    <p className="text-sm text-blue-500">{childCount} cards</p>
    <div className="mt-3 space-y-2">
      {/* Child previews or "Drop posts here" */}
    </div>
  </div>
</div>
```

**Keep existing logic:**
- `containerPadlets` useMemo (filter & sort containers)
- Auto-create empty container useEffects
- `hasAutoCreated` ref
- Empty state rendering

---

## Section 2: Implement Horizontal, Alternating, Horizontal-All Modes

**Horizontal mode:**
```tsx
<div className="flex flex-row gap-6 px-4">
  {/* Horizontal line at vertical center */}
  <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-gray-300" />

  {items.map(item => (
    <div className="relative flex flex-col items-center min-w-[280px]">
      {/* Dot on line */}
      <div className="w-3 h-3 rounded-full bg-blue-500 mb-2" />
      {/* Date + Card below */}
    </div>
  ))}
</div>
```
- Scroll container: `overflow-x-auto` instead of `overflow-y-auto`

**Alternating mode:**
```tsx
{items.map((item, index) => (
  <div className={`relative ${index % 2 === 0 ? 'pr-[50%]' : 'pl-[50%]'}`}>
    {/* Line in center */}
    <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-gray-300 -translate-x-1/2" />

    {/* Dot in center */}
    <div className="absolute left-1/2 top-4 w-3 h-3 rounded-full bg-blue-500 -translate-x-1/2" />

    {/* Card on alternating side */}
    <div className={index % 2 === 0 ? 'mr-8' : 'ml-8'}>
      {/* Card content */}
    </div>
  </div>
))}
```

**Horizontal-all mode:**
- Same as horizontal but with `flex-wrap` and smaller cards
- Shows all cards visible without horizontal scroll

**Mode switching logic:**
```tsx
const renderTimeline = () => {
  switch (chronoMode) {
    case 'vertical': return <VerticalTimeline items={items} />;
    case 'horizontal': return <HorizontalTimeline items={items} />;
    case 'alternating': return <AlternatingTimeline items={items} />;
    case 'horizontal-all': return <HorizontalAllTimeline items={items} />;
  }
};
```

---

## Section 3: Add Toolbar with Layout Switcher

**Keep existing `TimelineHeaderBar.tsx`** - it already works, just position it inside the new component.

**Integration:**
```tsx
return (
  <div className="relative flex flex-col w-full h-full" style={backgroundStyle}>
    {/* Toolbar - absolute positioned top-right */}
    <div className="absolute top-2 right-2 z-10">
      <TimelineHeaderBar
        currentMode={chronoMode}
        onModeChange={onModeChange}
      />
    </div>

    {/* Scrollable timeline area */}
    <div className="flex-1 min-h-0 overflow-auto p-4">
      {renderTimeline()}
    </div>
  </div>
);
```

**Note:** `TimelineHeaderBar` is rendered in `CanvasClient.tsx`, not inside the timeline component. Check if it needs to be moved or kept separate.

---

## Section 4: Remove react-chrono CSS Overrides

**Delete from `app/globals.css` lines 581-644:**
```css
/* DELETE ALL OF THIS: */

/* ---------------------------------------------------------- */
/* react-chrono isolation: undo Tailwind preflight overrides  */
/* ... all .chrono-isolation rules ... */
```

**Also delete `ChronoWrapper.tsx`:**
```bash
rm components/canvas/ChronoWrapper.tsx
```

**Remove react-chrono import from ChronoTimelineCanvas.tsx:**
```tsx
// DELETE: import Chrono from './ChronoWrapper';
```

**Optional: Uninstall react-chrono:**
```bash
npm uninstall react-chrono
```

---

## Section 5: Test All Layout Modes

**Test checklist:**

1. **Vertical mode:**
   - [ ] Timeline line on left
   - [ ] Dots aligned with cards
   - [ ] Vertical scrolling works
   - [ ] Cards clickable (opens ContainerEditor)
   - [ ] Right-click delete works
   - [ ] Empty container shows "Drop posts here"
   - [ ] Auto-creates empty container when all have children

2. **Horizontal mode:**
   - [ ] Timeline line horizontal
   - [ ] Horizontal scrolling works
   - [ ] Cards below line

3. **Alternating mode:**
   - [ ] Cards alternate left/right of center line
   - [ ] Vertical scrolling works

4. **Horizontal-all mode:**
   - [ ] All cards visible (wrapped)
   - [ ] No scroll or minimal scroll

5. **General:**
   - [ ] Layout switcher in toolbar changes mode
   - [ ] Mode persists on refresh (saved to canvas.settings.chronoMode)
   - [ ] `data-container-id` attribute on cards (for ghost drag drop)
   - [ ] Child preview cards show correctly
   - [ ] "+N more" shows when >3 children

---

## Quick Reference: Key Code Locations

| What | File | Lines |
|------|------|-------|
| Timeline component | `components/canvas/ChronoTimelineCanvas.tsx` | entire file |
| Chrono wrapper (delete) | `components/canvas/ChronoWrapper.tsx` | entire file |
| Header bar | `components/canvas/TimelineHeaderBar.tsx` | entire file |
| CSS overrides (delete) | `app/globals.css` | 581-644 |
| Canvas integration | `app/dashboard/canvas/[id]/CanvasClient.tsx` | search "ChronoTimelineCanvas" |
| ChronoMode type | `types/collabboard.ts` | search "ChronoMode" |

---

## Minimal Vertical Implementation (Copy-Paste Starter)

```tsx
"use client";

import React, { useMemo, useEffect, useRef } from 'react';
import PostPreviewCard from '@/components/collabboard/PostPreviewCard';
import type { Padlet, ChronoMode } from '@/types/collabboard';

interface TimelineCanvasProps {
  padlets: Padlet[];
  canvasId: string;
  chronoMode: ChronoMode;
  backgroundStyle?: React.CSSProperties;
  isEditable?: boolean;
  onOpenContainer: (container: Padlet) => void;
  onDeleteContainer?: (containerId: string) => void;
  onCreateEmptyContainer?: () => void;
}

export default function ChronoTimelineCanvas({
  padlets,
  canvasId,
  chronoMode,
  backgroundStyle,
  isEditable = true,
  onOpenContainer,
  onDeleteContainer,
  onCreateEmptyContainer,
}: TimelineCanvasProps) {
  const hasAutoCreated = useRef(false);

  // Filter to container-type padlets only
  const containerPadlets = useMemo(() => {
    return padlets
      .filter((p) => {
        const meta = p.metadata as any;
        const isContainer = p.type === 'container' || meta?.kind === 'container' || meta?.isContainer === true;
        const isChild = !!meta?.parentId;
        return isContainer && !isChild;
      })
      .sort((a, b) => {
        const posA = (a.metadata as any)?.position_in_timeline ?? 0;
        const posB = (b.metadata as any)?.position_in_timeline ?? 0;
        if (posA !== posB) return posA - posB;
        return new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime();
      });
  }, [padlets]);

  // Auto-create empty container logic (keep from original)
  useEffect(() => {
    if (!onCreateEmptyContainer) return;
    if (containerPadlets.length === 0 && !hasAutoCreated.current) {
      hasAutoCreated.current = true;
      onCreateEmptyContainer();
      return;
    }
    const allHaveChildren = containerPadlets.length > 0 && containerPadlets.every((c) => {
      const childIds = c.metadata?.childPadletIds || [];
      return childIds.length > 0;
    });
    if (allHaveChildren && !hasAutoCreated.current) {
      hasAutoCreated.current = true;
      onCreateEmptyContainer();
    }
  }, [containerPadlets, onCreateEmptyContainer]);

  useEffect(() => {
    const hasEmpty = containerPadlets.some((c) => (c.metadata?.childPadletIds || []).length === 0);
    if (hasEmpty) hasAutoCreated.current = false;
  }, [containerPadlets]);

  // Empty state
  if (containerPadlets.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={backgroundStyle}>
        <div className="text-center text-gray-400">
          <p className="text-lg font-medium mb-2">Timeline is empty</p>
          <p className="text-sm">Create a container from the sidebar to start building your timeline.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full min-h-0" style={backgroundStyle}>
      {/* Scroll container */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        <div className="relative">
          {containerPadlets.map((container, index) => {
            const childIds = container.metadata?.childPadletIds || [];
            const childPadlets = childIds.map((id: string) => padlets.find((p) => p.id === id)).filter(Boolean) as Padlet[];
            const isLast = index === containerPadlets.length - 1;

            return (
              <div key={container.id} className="relative pl-8 pb-8">
                {/* Vertical line */}
                {!isLast && (
                  <div className="absolute left-[5px] top-3 bottom-0 w-0.5 bg-gray-300" />
                )}

                {/* Dot */}
                <div className="absolute left-0 top-0 w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow" />

                {/* Date badge */}
                <div className="inline-block px-3 py-1 mb-3 text-xs font-medium text-white bg-blue-500 rounded">
                  {new Date(container.created_at || '').toLocaleDateString()}
                </div>

                {/* Card */}
                <div
                  data-container-id={container.id}
                  className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow max-w-sm"
                  onClick={() => onOpenContainer(container)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (onDeleteContainer && window.confirm(`Delete "${container.title || 'New Event'}"?`)) {
                      onDeleteContainer(container.id);
                    }
                  }}
                >
                  <h3 className="font-semibold text-blue-600">{container.title || 'New Event'}</h3>
                  <p className="text-sm text-blue-500 mb-3">{childPadlets.length} card{childPadlets.length === 1 ? '' : 's'}</p>

                  {childPadlets.length === 0 ? (
                    <p className="text-center text-sm text-gray-400 py-4">Drop posts here</p>
                  ) : (
                    <div className="space-y-2">
                      {childPadlets.slice(0, 3).map((p) => (
                        <div key={p.id} className="pointer-events-none select-none rounded-lg overflow-hidden">
                          <PostPreviewCard padlet={p} />
                        </div>
                      ))}
                      {childPadlets.length > 3 && (
                        <p className="text-[10px] text-gray-400 text-center pt-1">+{childPadlets.length - 3} more</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

This is Section 1 complete. Add other modes in Section 2.
