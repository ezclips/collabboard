# Embedded Comment Post Redesign Plan

## Problem Statement

The current embedded comment display inside containers has layout stability issues:
- Scrollbar and 3-button column shift/jump when content changes
- No clear visual boundaries between sections
- Design doesn't feel cohesive for the container context
- Positioning relies on workarounds (`pr-6`, `absolute right-0`)

## Design Goals

1. **Layout Stability** - No shifting, jumping, or flickering
2. **Professional Appearance** - Clean, modern, consistent with the app
3. **Container Fit** - Design that naturally fits within container cards
4. **Keep All Functionality** - Edit, strikethrough, delete, color picker, links

---

## New Layout Structure

### Visual Mockup (ASCII)

```
┌─────────────────────────────────────────────────┐
│  Comments (3)                           [+]     │  <- Header bar
├─────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────┐ │
│ │  [A] Alice  2m ago                     [•••]│ │  <- Comment row with actions
│ │  This is my comment text that can       │   │ │
│ │  wrap to multiple lines...              │   │ │
│ └─────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────┐ │
│ │  [B] Bob  5m ago                       [•••]│ │  <- Another comment
│ │  Another comment here                   │   │ │
│ └─────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│  [Add a comment...]                      [→]    │  <- Input area (optional)
└─────────────────────────────────────────────────┘
```

### Key Design Changes

| Current | New |
|---------|-----|
| Action buttons in separate column right of scroll area | Action buttons inline with each comment row |
| Absolute positioning for buttons | Flex layout with fixed button container |
| No visual separation between comments | Card-style comment rows with subtle borders |
| Scrollbar outside button area | Scrollbar within scroll container only |
| Header just text | Header bar with count + add button |

---

## Implementation Details

### Phase 1: Create New Embedded Comment Component

**New File:** `components/collabboard/EmbeddedCommentList.tsx`

This is a purpose-built component for displaying comments inside containers. It does NOT replace `CommentPopup.tsx` (which handles the modal/positioned popup case).

#### Props Interface

```tsx
interface EmbeddedCommentListProps {
  comments: CommentData[];
  currentUserId?: string;
  currentUserName?: string;
  currentUserAvatar?: string;
  onSubmit?: (text: string) => void;
  onEditComment?: (commentId: string, text: string) => void;
  onRemoveComment?: (commentId: string) => void;
  onToggleStrikethrough?: (commentId: string) => void;
  onColorChange?: (commentId: string, textColor?: string, bgColor?: string) => void;
  maxHeight?: number; // Default 240px
  showComposer?: boolean; // Default true
}
```

#### Component Structure

```tsx
<div className="embedded-comment-list">
  {/* Header Bar */}
  <div className="comment-header">
    <span>Comments ({count})</span>
    <button>+</button>
  </div>

  {/* Scroll Container - fixed height, internal scrollbar */}
  <div className="comment-scroll-area">
    {comments.map(comment => (
      <CommentRow key={comment.id} ... />
    ))}
  </div>

  {/* Input Area */}
  {showComposer && (
    <div className="comment-input-area">
      <input ... />
    </div>
  )}
</div>
```

---

### Phase 2: Comment Row Component

**New File:** `components/collabboard/CommentRow.tsx`

Each comment is a self-contained row with its own action buttons.

#### Layout Structure

```tsx
<div className="comment-row group">
  {/* Left: Avatar */}
  <div className="avatar">
    <span>{initial}</span>
  </div>

  {/* Center: Content (flex-1) */}
  <div className="content">
    <div className="header">
      <span className="name">{userName}</span>
      <span className="time">{timeAgo}</span>
    </div>
    <div className="body">{text}</div>
  </div>

  {/* Right: Actions (fixed width, always visible space reserved) */}
  <div className="actions">
    {isActive && (
      <>
        <button title="Edit"><PenIcon /></button>
        <button title="Strikethrough"><StrikeIcon /></button>
        <button title="Delete"><TrashIcon /></button>
      </>
    )}
  </div>
</div>
```

#### Key Features

1. **Action buttons appear on hover OR when row is active (clicked)**
2. **Fixed 24px width reserved for actions** - prevents layout shift
3. **Actions container uses `visibility: hidden` not `display: none`** - maintains space
4. **Each row is self-contained** - no external dependencies for layout

#### CSS Classes

```css
.comment-row {
  display: flex;
  gap: 8px;
  padding: 8px;
  border-radius: 8px;
  transition: background-color 150ms;
}

.comment-row:hover {
  background-color: #f9fafb; /* gray-50 */
}

.comment-row.active {
  background-color: #eff6ff; /* blue-50 */
}

.comment-row .actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 24px; /* Fixed width - always reserved */
  flex-shrink: 0;
}

.comment-row .actions button {
  visibility: hidden;
  width: 20px;
  height: 20px;
}

.comment-row:hover .actions button,
.comment-row.active .actions button {
  visibility: visible;
}
```

---

### Phase 3: Scroll Container Design

The scroll container is the key to eliminating layout shift.

#### Requirements

1. **Fixed outer dimensions** - container doesn't grow/shrink
2. **Internal scrollbar only** - scrollbar inside the scroll area, not affecting button column
3. **Stable gutter** - always reserve space for scrollbar

#### Implementation

```tsx
<div
  className="overflow-y-scroll scrollbar-thin"
  style={{
    maxHeight: maxHeight || 240,
    scrollbarGutter: 'stable',
  }}
>
  {/* Comments render here */}
</div>
```

**Key:** Use `overflow-y-scroll` (not `auto`) to always show scrollbar track, preventing jump when content exceeds height.

---

### Phase 4: Header Bar Design

```tsx
<div className="flex items-center justify-between px-2 py-1.5 bg-gray-50 rounded-t-lg border-b border-gray-100">
  <span className="text-xs font-medium text-gray-600">
    Comments ({comments.length})
  </span>
  <button
    className="w-6 h-6 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-400 hover:text-blue-500 hover:border-blue-300 transition-colors"
    title="Add comment"
  >
    <Plus size={14} />
  </button>
</div>
```

---

### Phase 5: Input Area Design

```tsx
<div className="px-2 py-2 border-t border-gray-100 bg-gray-50/50 rounded-b-lg">
  <div className="flex gap-2">
    <input
      type="text"
      placeholder="Add a comment..."
      className="flex-1 text-xs px-3 py-1.5 rounded-full border border-gray-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-100 outline-none bg-white"
    />
    <button className="w-7 h-7 rounded-full bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 transition-colors disabled:opacity-50">
      <Send size={12} />
    </button>
  </div>
</div>
```

---

### Phase 6: Integration with RowColumnContainerCard

**Modify:** `components/collabboard/RowColumnContainerCard.tsx`

Replace the current CommentPopup usage with the new EmbeddedCommentList:

```tsx
// Current (lines 172-207)
isCommentPost(child) && onUpdateChildComments ? (
  <div key={child.id} className="w-full max-w-full overflow-hidden min-h-[80px]">
    <CommentPopup
      isOpen={true}
      onOpenChange={() => { }}
      embedded={true}
      ...
    />
  </div>
)

// New
isCommentPost(child) && onUpdateChildComments ? (
  <EmbeddedCommentList
    key={child.id}
    comments={(child.metadata as any)?.comments || []}
    currentUserId={currentUserId}
    currentUserName={currentUserName}
    currentUserAvatar={currentUserAvatar}
    onSubmit={(text) => {
      const newComment = {
        id: `comment-${Date.now()}`,
        text,
        userId: currentUserId || 'anonymous',
        userName: currentUserName || 'Anonymous',
        userAvatar: currentUserAvatar,
        timestamp: Date.now(),
      };
      const existing = (child.metadata as any)?.comments || [];
      onUpdateChildComments(child.id, [...existing, newComment]);
    }}
    onEditComment={(commentId, newText) => {
      const existing = (child.metadata as any)?.comments || [];
      const updated = existing.map((c: any) =>
        c.id === commentId ? { ...c, text: newText } : c
      );
      onUpdateChildComments(child.id, updated);
    }}
    onRemoveComment={(commentId) => {
      const existing = (child.metadata as any)?.comments || [];
      onUpdateChildComments(child.id, existing.filter((c: any) => c.id !== commentId));
    }}
    onToggleStrikethrough={(commentId) => {
      const existing = (child.metadata as any)?.comments || [];
      const updated = existing.map((c: any) =>
        c.id === commentId ? { ...c, isStrikethrough: !c.isStrikethrough } : c
      );
      onUpdateChildComments(child.id, updated);
    }}
  />
)
```

---

## File Changes Summary

| Action | File | Description |
|--------|------|-------------|
| CREATE | `components/collabboard/EmbeddedCommentList.tsx` | New dedicated embedded comment component |
| CREATE | `components/collabboard/CommentRow.tsx` | Reusable comment row with inline actions |
| MODIFY | `components/collabboard/RowColumnContainerCard.tsx` | Replace CommentPopup with EmbeddedCommentList |
| MODIFY | `components/canvas/ChronoTimelineCanvas.tsx` | Use EmbeddedCommentList if applicable |
| KEEP | `components/collabboard/editors/CommentPopup.tsx` | Keep for modal/positioned popup use cases |

---

## Design Specifications

### Colors

| Element | Color | Tailwind |
|---------|-------|----------|
| Header background | #f9fafb | bg-gray-50 |
| Active row | #eff6ff | bg-blue-50 |
| Hover row | #f9fafb | bg-gray-50 |
| Avatar bg | #3b82f6 | bg-blue-500 |
| Button default | #d1d5db | text-gray-300 |
| Button hover (edit) | #3b82f6 | hover:text-blue-500 |
| Button hover (delete) | #ef4444 | hover:text-red-500 |
| Border | #e5e7eb | border-gray-200 |
| Input border focus | #60a5fa | focus:border-blue-400 |

### Spacing

| Element | Value | Tailwind |
|---------|-------|----------|
| Row padding | 8px | p-2 |
| Row gap | 8px | gap-2 |
| Button size | 20x20px | w-5 h-5 |
| Avatar size | 24x24px | w-6 h-6 |
| Icon size | 12x12px | w-3 h-3 |
| Actions column width | 24px (fixed) | w-6 |
| Max scroll height | 240px | max-h-[240px] |
| Row border radius | 8px | rounded-lg |

### Typography

| Element | Size | Weight | Tailwind |
|---------|------|--------|----------|
| Header title | 12px | 500 | text-xs font-medium |
| User name | 12px | 500 | text-xs font-medium |
| Time ago | 10px | 400 | text-[10px] |
| Comment text | 12px | 400 | text-xs |
| Input placeholder | 12px | 400 | text-xs |

---

## Testing Checklist

After implementation:

- [ ] Scrollbar never causes layout shift
- [ ] Action buttons don't cause horizontal movement when appearing/hiding
- [ ] Comments can be scrolled smoothly
- [ ] Edit mode works correctly with TipTap editor
- [ ] Color picker opens without layout jump
- [ ] Strikethrough toggles correctly and shows visual state
- [ ] Delete removes comment and updates count
- [ ] New comment submission works
- [ ] Active state (blue highlight) works on click
- [ ] Hover state (gray highlight) works
- [ ] Works in RowColumnContainerCard
- [ ] Works in timeline containers
- [ ] Empty state shows "No comments yet"
- [ ] Long comments wrap correctly
- [ ] HTML content renders correctly (links, formatting)

---

## Migration Notes

1. `CommentPopup.tsx` with `embedded={true}` is still valid but deprecated for container use
2. The new `EmbeddedCommentList` is purpose-built for container context
3. Both components share the same `CommentData` interface
4. No database changes required - same metadata structure
