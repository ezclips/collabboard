# Content Rendering Architecture Fix

## 🔴 The Problem: Business Logic in Rendering Helper

**Symptom**: Everything shows as "Comment" — links, todos, tables all display as comment previews.

**Root Cause**: `SafeHtmlContent` was trying to be "smart" by:
- Parsing JSON content
- Detecting comment arrays
- Extracting comment previews

This is **wrong** because it puts **business logic** (what kind of post is this?) into a **rendering helper** (how do I display this string?).

---

## ❌ What Went Wrong

```
SafeHtmlContent (BAD version)
├── Decode HTML entities ✅ (correct responsibility)
├── Detect HTML vs text ✅ (correct responsibility)  
├── Sanitize HTML ✅ (correct responsibility)
├── Parse JSON ❌ (WRONG - business logic)
├── Detect comment arrays ❌ (WRONG - business logic)
├── Extract comment preview ❌ (WRONG - business logic)
└── Render
```

**Result**: 
- Todo task arrays → treated as "comments" → broken preview
- Table row arrays → treated as "comments" → broken preview
- Link metadata → ignored → just shows URL
- Everything looks like a comment

---

## ✅ The Fix: Separation of Concerns

```
ContainerChildPreviewCard (business logic)
├── Check padlet.type
├── If "link" → render link preview (using metadata)
├── If "todo" → render task list (using metadata.tasks)
├── If "comment" → extract last comment (from metadata.comments)
├── Else → pass content to SafeHtmlContent
│
└── SafeHtmlContent (rendering only)
    ├── Decode HTML entities
    ├── Detect HTML vs text
    ├── Sanitize HTML
    └── Render
```

**Result**:
- Links show title + domain + thumbnail
- Todos show checklist items
- Comments show last comment + count
- Text posts render rich HTML correctly

---

## 🛠️ Implementation

### Step 1: Replace SafeHtmlContent.tsx (Make It Dumb)

Replace `components/collabboard/SafeHtmlContent.tsx` with this simple version:

```tsx
"use client";

import React, { useMemo } from "react";

type RenderMode = "auto" | "html" | "text";

export default function SafeHtmlContent({
  content,
  className,
  mode = "auto",
  emptyFallback = null,
  maxChars,
  preserveLineBreaks = false,
}: {
  content: unknown;
  className?: string;
  mode?: RenderMode;
  emptyFallback?: React.ReactNode;
  maxChars?: number;
  preserveLineBreaks?: boolean;
}) {
  const raw = useMemo(() => asString(content), [content]);

  const trimmed = useMemo(() => raw.trim(), [raw]);

  if (!trimmed) {
    return emptyFallback ? <>{emptyFallback}</> : null;
  }

  const decoded = useMemo(() => decodeEntitiesDeep(trimmed), [trimmed]);

  const finalString = useMemo(() => {
    let s = decoded;

    if (!s.trim()) return "";

    if (!preserveLineBreaks) {
      s = collapseWhitespace(s);
    }

    if (typeof maxChars === "number" && maxChars > 0 && s.length > maxChars) {
      s = s.slice(0, maxChars).trimEnd() + "…";
    }

    return s;
  }, [decoded, maxChars, preserveLineBreaks]);

  if (!finalString.trim()) {
    return emptyFallback ? <>{emptyFallback}</> : null;
  }

  const shouldRenderHtml = useMemo(() => {
    if (mode === "text") return false;
    if (mode === "html") return true;
    return looksLikeHtml(finalString);
  }, [mode, finalString]);

  if (!shouldRenderHtml) {
    return <span className={className}>{finalString}</span>;
  }

  const safeHtml = useMemo(() => sanitizeHtml(finalString), [finalString]);

  return (
    <span
      className={className}
      style={{ wordWrap: "break-word", overflowWrap: "break-word" }}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}

/* ========================= helpers ========================= */

function asString(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  try {
    return String(v);
  } catch {
    return "";
  }
}

// Stricter: only treat as HTML if it resembles richtext tags or encoded richtext
function looksLikeHtml(s: string): boolean {
  const t = s.trim();
  if (!t) return false;

  if (t.includes("&lt;") || t.includes("&gt;") || t.includes("&amp;lt;")) return true;

  const tagLike = /<(p|br|div|span|ul|ol|li|strong|em|b|i|u|a|h[1-6]|blockquote|code|pre)(\s|>|\/>)/i;
  return tagLike.test(t);
}

function decodeEntitiesDeep(input: string): string {
  let s = input;
  for (let i = 0; i < 3; i++) {
    const next = decodeEntitiesOnce(s);
    if (next === s) break;
    s = next;
  }
  return s;
}

function decodeEntitiesOnce(input: string): string {
  const named: Record<string, string> = {
    "&lt;": "<",
    "&gt;": ">",
    "&amp;": "&",
    "&quot;": '"',
    "&#34;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&nbsp;": " ",
  };

  let s = input.replace(
    /&(lt|gt|amp|quot|apos|nbsp);|&#34;|&#39;/g,
    (m) => named[m] ?? m
  );

  s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    const code = parseInt(hex, 16);
    return Number.isFinite(code) ? String.fromCharCode(code) : _;
  });

  s = s.replace(/&#(\d+);/g, (_, dec) => {
    const code = parseInt(dec, 10);
    return Number.isFinite(code) ? String.fromCharCode(code) : _;
  });

  return s;
}

function sanitizeHtml(html: string): string {
  // Minimal sanitizer (swap to DOMPurify if you have it)
  let s = html.replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, "");
  s = s.replace(/\son\w+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "");
  s = s.replace(/\shref\s*=\s*("javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+)/gi, ' href="#"');
  s = s.replace(/\ssrc\s*=\s*("javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+)/gi, ' src=""');
  return s;
}

function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}
```

**What this version does:**
- ✅ Decode HTML entities (including double-encoding)
- ✅ Detect HTML vs plain text (strict tag allowlist)
- ✅ Sanitize dangerous HTML
- ✅ Render with proper word wrapping

**What this version does NOT do:**
- ❌ No JSON parsing
- ❌ No comment detection
- ❌ No array inspection
- ❌ No business logic

---

### Step 2: Replace ContainerChildPreviewCard.tsx (Add Business Logic)

Replace `components/collabboard/ContainerChildPreviewCard.tsx` with this version that handles type-specific rendering:

```tsx
"use client";

import React, { useMemo } from "react";
import { X, MessageCircle, StickyNote, Link2, ListTodo } from "lucide-react";
import SafeHtmlContent from "@/components/collabboard/SafeHtmlContent";
import type { Padlet } from "@/types/collabboard";

type Props = {
  padlet: Padlet;
  onRemove?: () => void;
  className?: string;
};

function normalizeType(t: unknown): string {
  return String(t ?? "").trim().toLowerCase();
}

function asString(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  try {
    return String(v);
  } catch {
    return "";
  }
}

function pickLastCommentPreview(p: Padlet): { preview: string; count: number } {
  const comments = Array.isArray((p as any)?.metadata?.comments) ? (p as any).metadata.comments : [];
  const count = comments.length;

  if (!count) return { preview: "", count: 0 };

  const last = comments[count - 1];
  const preview =
    asString(last?.text).trim() ||
    asString(last?.content).trim() ||
    asString(last?.html).trim() ||
    asString(last?.message).trim() ||
    "";

  return { preview, count };
}

export default function ContainerChildPreviewCard({ padlet, onRemove, className }: Props) {
  const type = normalizeType(padlet.type);

  // IMPORTANT: Only treat as comment if type is "comment" OR metadata.comments exists
  // Do NOT infer from JSON arrays in content!
  const isComment = type === "comment" || Array.isArray((padlet as any)?.metadata?.comments);

  const title = isComment
    ? "Comment"
    : type === "link"
      ? "Link"
      : type === "todo"
        ? "To-Do"
        : "Note";

  const Icon = isComment
    ? MessageCircle
    : type === "link"
      ? Link2
      : type === "todo"
        ? ListTodo
        : StickyNote;

  const { preview: commentPreview, count: commentCount } = useMemo(
    () => (isComment ? pickLastCommentPreview(padlet) : { preview: "", count: 0 }),
    [isComment, padlet]
  );

  const linkMeta = (padlet as any)?.metadata ?? {};
  const linkTitle = asString(linkMeta?.linkTitle).trim();
  const linkDomain = asString(linkMeta?.linkDomain).trim();
  const linkImage = asString(linkMeta?.linkImage).trim();
  const linkUrl = asString(linkMeta?.linkUrl).trim() || asString(padlet.content).trim();

  const tasks = Array.isArray((padlet as any)?.metadata?.tasks) ? (padlet as any).metadata.tasks : [];

  return (
    <div className={`relative rounded-lg border bg-white shadow-sm ${className ?? ""}`}>
      {/* Left accent bar */}
      <div className={`absolute left-0 top-0 h-full w-1 rounded-l-lg ${isComment ? "bg-yellow-400" : "bg-orange-400"}`} />

      <div className="flex items-start gap-3 p-3 pl-4">
        <div className="mt-0.5 flex min-w-0 flex-1 items-start gap-2">
          <Icon className={`h-4 w-4 shrink-0 ${isComment ? "text-teal-500" : "text-gray-500"}`} />

          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-gray-800">{title}</div>

            {/* ========== LINK PREVIEW ========== */}
            {type === "link" && !isComment && (
              <div className="mt-2 space-y-2">
                {linkImage && (
                  <div className="overflow-hidden rounded-md border bg-gray-50">
                    <img
                      src={linkImage}
                      alt=""
                      className="h-20 w-full object-cover"
                      onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                    />
                  </div>
                )}

                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-blue-700">
                    {linkTitle || linkUrl || "Untitled link"}
                  </div>
                  <div className="truncate text-[11px] text-gray-500">{linkDomain || linkUrl}</div>
                </div>
              </div>
            )}

            {/* ========== TODO PREVIEW ========== */}
            {type === "todo" && !isComment && (
              <div className="mt-2 space-y-1">
                {tasks.length ? (
                  <>
                    {tasks.slice(0, 3).map((t: any) => (
                      <div key={asString(t.id)} className="flex items-start gap-2 text-[12px] text-gray-700">
                        <span className="mt-0.5 inline-block h-3 w-3 rounded border border-gray-300 bg-white" />
                        <span className={`min-w-0 flex-1 truncate ${t.completed ? "line-through text-gray-400" : ""}`}>
                          {asString(t.text)}
                        </span>
                      </div>
                    ))}
                    {tasks.length > 3 && (
                      <div className="text-[11px] text-gray-500">+{tasks.length - 3} more</div>
                    )}
                  </>
                ) : (
                  <div className="text-[12px] text-gray-500">No tasks</div>
                )}
              </div>
            )}

            {/* ========== COMMENT PREVIEW ========== */}
            {isComment && (
              <div className="mt-2">
                <SafeHtmlContent
                  content={commentPreview || ""}
                  className="block text-xs text-gray-700 line-clamp-3"
                  mode="auto"
                />
                {commentCount > 0 && (
                  <div className="mt-2 text-[11px] text-gray-500">
                    {commentCount} comment{commentCount === 1 ? "" : "s"}
                  </div>
                )}
              </div>
            )}

            {/* ========== DEFAULT TEXT PREVIEW ========== */}
            {!isComment && type !== "link" && type !== "todo" && (
              <div className="mt-2">
                <SafeHtmlContent
                  content={padlet.content}
                  className="block text-xs text-gray-700 line-clamp-3"
                  mode="auto"
                />
              </div>
            )}
          </div>
        </div>

        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRemove();
            }}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
            aria-label="Remove"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
```

---

## 📊 Before vs After

| Post Type | Before (Broken) | After (Fixed) |
|-----------|-----------------|---------------|
| **Link** | Shows as "Comment" with raw URL | Shows title + domain + thumbnail |
| **Todo** | Shows JSON array as comment | Shows checklist with items |
| **Comment** | Shows JSON garbage | Shows last comment + count |
| **Text** | May show as comment | Renders rich HTML correctly |
| **Table** | May show as comment | Not "commentified" |

---

## 🔑 Key Principle: Comment Detection

**ONLY** treat something as a comment if:

```tsx
const isComment = type === "comment" || Array.isArray(padlet.metadata?.comments);
```

**NEVER** detect comments by:
- ❌ Parsing `padlet.content` as JSON
- ❌ Checking if content looks like an array
- ❌ Inferring from array elements having `text` field

The `metadata.comments` field is the **canonical source of truth** for comments.

---

## ⚠️ Code to Remove

Search your codebase for and **REMOVE** any of these patterns:

```tsx
// ❌ REMOVE: JSON parsing in SafeHtmlContent or rendering helpers
const parsed = JSON.parse(content);

// ❌ REMOVE: Array-based comment detection
if (Array.isArray(parsed)) { ... }

// ❌ REMOVE: "Commentish" detection
if (payload.some(el => isCommentish(el))) { ... }

// ❌ REMOVE: Content-based comment inference
const isComment = content.includes('[{') || content.startsWith('[');
```

---

## 📋 Implementation Checklist

### Phase 1: Replace Components
- [ ] Replace `SafeHtmlContent.tsx` with the "dumb" version
- [ ] Replace `ContainerChildPreviewCard.tsx` with type-aware version
- [ ] Verify no TypeScript errors

### Phase 2: Remove Bad Patterns
- [ ] Search for `JSON.parse` in rendering components → remove
- [ ] Search for `isCommentish` → remove
- [ ] Search for array-based comment detection → remove
- [ ] Search for `extractCommentPreview` → remove from SafeHtmlContent

### Phase 3: Verify Other Renderers
- [ ] Check `PostCardContent.tsx` - should use `metadata.comments` for comments
- [ ] Check any other preview cards - should not infer comment from content

### Phase 4: Testing
- [ ] Link in container → shows link preview (not "Comment")
- [ ] Todo in container → shows task list (not "Comment")
- [ ] Comment in container → shows last comment text + count
- [ ] Text in container → shows rich HTML preview
- [ ] Table in container → does NOT show as "Comment"

---

## 🎯 Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                    BUSINESS LOGIC LAYER                          │
│                                                                  │
│  ContainerChildPreviewCard / PostCardContent / etc.              │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ type=link   │  │ type=todo   │  │ type=comment│              │
│  │             │  │             │  │             │              │
│  │ Use:        │  │ Use:        │  │ Use:        │              │
│  │ metadata.   │  │ metadata.   │  │ metadata.   │              │
│  │ linkTitle   │  │ tasks[]     │  │ comments[]  │              │
│  │ linkDomain  │  │             │  │             │              │
│  │ linkImage   │  │             │  │             │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         │                │                │                      │
│         │ For text       │ Task text      │ Comment text         │
│         │ content only   │ (plain)        │ (may be HTML)        │
│         ▼                ▼                ▼                      │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    RENDERING LAYER                               │
│                                                                  │
│                    SafeHtmlContent                               │
│                                                                  │
│  INPUT: string (may be HTML, may be plain text)                  │
│                                                                  │
│  ┌──────────────┐                                                │
│  │ Decode HTML  │ &lt;p&gt; → <p>                                │
│  │ entities     │ (supports double-encoding)                     │
│  └──────┬───────┘                                                │
│         ▼                                                        │
│  ┌──────────────┐                                                │
│  │ Detect HTML  │ Does it contain <p>, <strong>, etc.?           │
│  │ vs text      │ (strict tag allowlist)                         │
│  └──────┬───────┘                                                │
│         ▼                                                        │
│  ┌──────────────┐                                                │
│  │ Sanitize     │ Remove <script>, onclick=, javascript:         │
│  └──────┬───────┘                                                │
│         ▼                                                        │
│  ┌──────────────┐                                                │
│  │ Render       │ dangerouslySetInnerHTML or plain text          │
│  └──────────────┘                                                │
│                                                                  │
│  OUTPUT: Safe rendered content                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📝 Summary

**The mistake**: Putting "what kind of post is this?" logic into `SafeHtmlContent`.

**The fix**: 
1. `SafeHtmlContent` only handles string → safe HTML rendering
2. `ContainerChildPreviewCard` handles post type → appropriate preview

**The rule**: 
- Comment detection = `type === "comment" OR metadata.comments exists`
- Never infer from parsing `padlet.content`

---

*Generated: January 26, 2026*
*Fixes: "Everything shows as Comment" issue caused by business logic in rendering helper*
