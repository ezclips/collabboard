# Preview Renderer Lint Rules

This document defines architecture conventions to prevent visual drift between preview and runtime rendering.

## Rules

### 1. Preview Contexts: Use ONLY `PostPreviewCard`

The following locations are **preview-only** and must use `PostPreviewCard` exclusively:

| Location | Rule |
|----------|------|
| `lib/collabboard/layouts/*` | ✅ `PostPreviewCard` only |
| `*Preview*.tsx` files | ✅ `PostPreviewCard` only |
| `*Overlay*.tsx` files | ✅ `PostPreviewCard` only |
| `CanvasSetup*.tsx` files | ✅ `PostPreviewCard` only |

#### Forbidden Imports in Preview Contexts

```typescript
// ❌ NEVER in preview/setup files:
import PostCardContent from '@/components/collabboard/PostCardContent';
import SafeHtmlContent from '@/components/collabboard/SafeHtmlContent';

// ✅ ALWAYS use this instead:
import PostPreviewCard from '@/components/collabboard/PostPreviewCard';
```

### 2. Runtime Contexts: Use `PostCardContent`

For **runtime canvases** that need full-fidelity rendering (interactive posts, full media support), use `PostCardContent`:

| Location | Rule |
|----------|------|
| `*Canvas.tsx` files | ✅ `PostCardContent` for runtime cards |
| `*LayoutRenderer.tsx` files | ✅ `PostCardContent` for runtime cards |
| `ContainerEditor.tsx` | ✅ `PostCardContent` for child rendering |

## Verification Commands

Run these grep commands to verify compliance:

```bash
# Should return NO results:
grep -r "PostCardContent" lib/collabboard/layouts/
grep -r "SafeHtmlContent" lib/collabboard/layouts/
grep -r "PostCardContent" --include="*Preview*.tsx" components/
grep -r "SafeHtmlContent" --include="*Preview*.tsx" components/
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     PREVIEW LAYER                           │
│  lib/collabboard/layouts/*  |  *Preview*  |  *Overlay*     │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              PostPreviewCard (ONLY)                  │   │
│  │  → ContainerChildPreviewCard                         │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ NEVER cross this boundary
                              │
┌─────────────────────────────────────────────────────────────┐
│                     RUNTIME LAYER                           │
│  *Canvas.tsx  |  *LayoutRenderer.tsx  |  ContainerEditor   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              PostCardContent (full-fidelity)         │   │
│  │  → Full media, tables, todos, links, etc.            │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Why This Matters

- **Consistent Previews**: All previews look identical regardless of context
- **No Drift**: Changes to preview appearance propagate everywhere
- **Clear Separation**: Runtime features don't leak into previews
- **Easy Debugging**: One source of truth per layer
