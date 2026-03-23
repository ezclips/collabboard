# JSON Content Rendering Fix - Implementation Plan

## 🔴 New Problem Discovered

After implementing the HTML rendering fix, a new issue appeared: **content that is JSON (not HTML) renders as nonsense**.

### What You're Seeing

```
"" / one / ... (+1 more)
```

Or raw JSON like:
```
[{"id":"abc","text":"one"},{"id":"def","text":"two"}]
```

### Root Cause

The `SafeHtmlContent` component was designed to handle **HTML strings**, but `padlet.content` can also be:

| Content Type | Example | Current Result |
|-------------|---------|----------------|
| JSON array of comments | `[{"text":"one"},{"text":"two"}]` | Shows raw JSON |
| Stringified JSON | `"[{\"text\":\"one\"}]"` | Shows escaped quotes |
| Double-stringified JSON | `"\"[{\\\"text\\\":\\\"one\\\"}]\""` | Complete mess |
| Object with nested HTML | `{"html":"<p>Hello</p>"}` | Shows `{"html":"<p>Hello</p>"}` |
| Legacy comment payload | `{"comments":[...]}` | Shows entire object |

---

## ✅ The Solution

Upgrade `SafeHtmlContent` to be **content-agnostic** — it should handle ALL content shapes:

1. **Unwrap JSON** (including double-stringified)
2. **Extract human-readable preview** from comment arrays/objects
3. **Decode HTML entities** (including double-encoding)
4. **Decide** whether to render as HTML or plain text
5. **Sanitize** before `dangerouslySetInnerHTML`

---

## 🛠️ Implementation

### Step 1: Replace SafeHtmlContent.tsx

Replace `components/collabboard/SafeHtmlContent.tsx` with this complete implementation:

```tsx
"use client";

import React, { useMemo } from "react";

type RenderMode = "auto" | "html" | "text";

/**
 * SafeHtmlContent
 * - Accepts raw strings, HTML strings, encoded HTML (&lt;p&gt;), JSON strings, or comment payloads.
 * - Extracts a sensible preview from JSON/comment payloads.
 * - Decodes entities (supports double-encoding like &amp;lt;).
 * - Sanitizes HTML before rendering.
 */
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
  const normalized = useMemo(() => normalizeContent(content), [content]);

  const finalText = useMemo(() => {
    let s = normalized;

    if (!s.trim()) return "";

    // Optionally trim for previews
    if (typeof maxChars === "number" && maxChars > 0 && s.length > maxChars) {
      s = s.slice(0, maxChars).trimEnd() + "…";
    }

    return s;
  }, [normalized, maxChars]);

  if (!finalText.trim()) {
    return emptyFallback ? <>{emptyFallback}</> : null;
  }

  const decoded = useMemo(() => decodeEntitiesDeep(finalText), [finalText]);

  const shouldRenderHtml = useMemo(() => {
    if (mode === "text") return false;
    if (mode === "html") return true;

    // auto
    return looksLikeHtml(decoded) || looksLikeHtml(finalText);
  }, [mode, decoded, finalText]);

  if (!shouldRenderHtml) {
    const text = preserveLineBreaks ? decoded : collapseWhitespace(decoded);
    return <span className={className}>{text}</span>;
  }

  const safeHtml = useMemo(() => sanitizeHtml(decoded), [decoded]);

  return (
    <span
      className={className}
      style={{ wordWrap: "break-word", overflowWrap: "break-word" }}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}

/* =====================================================================================
 * Normalization pipeline
 * ===================================================================================== */

function normalizeContent(input: unknown): string {
  const raw = asString(input).trim();
  if (!raw) return "";

  // 1) Try to unwrap JSON (including double-stringified)
  const unwrapped = unwrapJson(raw);

  // 2) If the JSON looks like a "comments payload", convert to a human preview
  const commentPreview = extractCommentPreview(unwrapped);
  if (commentPreview) return commentPreview;

  // 3) If it's a JSON object with common fields, prefer those
  const objectPreview = extractObjectPreview(unwrapped);
  if (objectPreview) return objectPreview;

  // 4) Otherwise treat as string content
  return typeof unwrapped === "string" ? unwrapped : raw;
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

/**
 * Attempts to parse JSON repeatedly to handle:
 * - JSON arrays/objects
 * - JSON string that contains JSON again (double-stringified)
 */
function unwrapJson(raw: string): unknown {
  const s = raw.trim();
  if (!s) return s;

  // Quick check to avoid parsing everything
  const maybeJson =
    s.startsWith("{") ||
    s.startsWith("[") ||
    (s.startsWith('"') && s.endsWith('"')) ||
    s.startsWith("&quot;");

  if (!maybeJson) return raw;

  let current: unknown = raw;

  for (let i = 0; i < 3; i++) {
    if (typeof current !== "string") break;

    const candidate = decodeEntitiesDeep(current).trim();

    // If it looks like a quoted JSON string, try to JSON.parse it
    try {
      const parsed = JSON.parse(candidate);
      current = parsed;
      continue;
    } catch {
      // Not JSON at this level
      break;
    }
  }

  return current;
}

/**
 * If the payload is an array of comments or contains comments, build a preview:
 * - last comment text/content
 * - plus count hint if there are more
 * 
 * IMPORTANT: Only treat as comments array if elements look like comment objects.
 * This prevents accidentally "preview-ifying" other arrays (table rows, drawing points, etc.)
 */
function extractCommentPreview(payload: unknown): string | null {
  // Array of comments - but ONLY if elements look like comment objects
  if (Array.isArray(payload)) {
    // Safety check: at least one element must look like a comment
    const looksLikeComments = payload.some(el => isCommentish(el));
    if (!looksLikeComments) return null;
    
    const comments = payload;
    const last = comments[comments.length - 1];
    const lastText = pickText(last);
    if (!lastText) return null;

    const decoded = decodeEntitiesDeep(lastText);
    const plain = stripHtml(decoded).trim();

    if (comments.length > 1) return `${plain} (+${comments.length - 1} more)`;
    return plain;
  }

  // Object with comments field
  if (payload && typeof payload === "object") {
    const anyObj = payload as any;
    const maybe = anyObj.comments ?? anyObj.metadata?.comments;
    if (Array.isArray(maybe) && maybe.some(el => isCommentish(el))) {
      const last = maybe[maybe.length - 1];
      const lastText = pickText(last);
      if (!lastText) return null;

      const decoded = decodeEntitiesDeep(lastText);
      const plain = stripHtml(decoded).trim();

      if (maybe.length > 1) return `${plain} (+${maybe.length - 1} more)`;
      return plain;
    }
  }

  return null;
}

/**
 * Checks if an object looks like a comment (has text/content/html/message field).
 * This prevents treating arbitrary arrays (table data, coordinates, etc.) as comments.
 */
function isCommentish(el: unknown): boolean {
  if (!el || typeof el !== "object") return false;
  const o = el as any;
  return !!(
    (typeof o.text === "string" && o.text.trim()) ||
    (typeof o.content === "string" && o.content.trim()) ||
    (typeof o.html === "string" && o.html.trim()) ||
    (typeof o.message === "string" && o.message.trim())
  );
}

/**
 * For generic objects, pick useful fields in preference order.
 */
function extractObjectPreview(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;

  const obj = payload as any;

  const fields = [
    obj.text,
    obj.content,
    obj.title,
    obj.value,
    obj.message,
    obj.body,
    obj.html,
  ];

  for (const f of fields) {
    const s = asString(f).trim();
    if (s) return s;
  }

  return null;
}

function pickText(v: unknown): string {
  if (!v) return "";
  if (typeof v === "string") return v;

  if (typeof v === "object") {
    const o = v as any;
    return (
      asString(o.text).trim() ||
      asString(o.content).trim() ||
      asString(o.html).trim() ||
      asString(o.message).trim() ||
      ""
    );
  }

  return asString(v).trim();
}

/* =====================================================================================
 * HTML detect / decode / sanitize helpers
 * ===================================================================================== */

function looksLikeHtml(s: string): boolean {
  const t = s.trim();
  if (!t) return false;

  // encoded html
  if (t.includes("&lt;") || t.includes("&gt;") || t.includes("&amp;lt;")) return true;

  // common richtext tags (more precise than "contains <")
  const tagLike = /<(p|br|div|span|ul|ol|li|strong|em|b|i|u|a|h[1-6]|blockquote|code|pre)(\s|>|\/>)/i;
  return tagLike.test(t);
}

/**
 * Decode entities multiple times to handle double-encoding:
 * "&amp;lt;p&amp;gt;" -> "&lt;p&gt;" -> "<p>"
 */
function decodeEntitiesDeep(input: string): string {
  let s = input;

  for (let i = 0; i < 3; i++) {
    const next = decodeEntitiesOnce(s);
    if (next === s) break;
    s = next;
  }

  return s;
}

/**
 * No DOM dependency; works in SSR too.
 * Covers common entities + numeric entities.
 */
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

  // numeric entities: &#xNN; or &#NN;
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

/**
 * Minimal sanitizer:
 * - removes script/style/iframe/object/embed
 * - strips on* handlers and javascript: urls
 *
 * ⚠️ WARNING: This minimal sanitizer is NOT sufficient for production XSS protection!
 * It doesn't handle: SVG payloads, data URLs, malformed attributes, CSS injection, etc.
 * 
 * RECOMMENDED: Use DOMPurify instead. If it's already in your project:
 *   import DOMPurify from "dompurify";
 *   const safeHtml = DOMPurify.sanitize(decoded, { ... });
 * 
 * This minimal version is a placeholder for SSR or when DOMPurify isn't available.
 */
function sanitizeHtml(html: string): string {
  // If DOMPurify is available, prefer it (uncomment below):
  // if (typeof window !== 'undefined' && window.DOMPurify) {
  //   return window.DOMPurify.sanitize(html);
  // }
  
  // Remove dangerous tags
  let s = html.replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, "");

  // Remove event handlers like onclick=
  s = s.replace(/\son\w+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "");

  // Neutralize javascript: urls
  s = s.replace(/\shref\s*=\s*("javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+)/gi, ' href="#"');
  s = s.replace(/\ssrc\s*=\s*("javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+)/gi, ' src=""');

  return s;
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, "");
}

function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}
```

---

### Step 2: Update TableLayout.tsx Usage

For table cells (which are previews), use `mode="text"` to avoid rendering rich HTML in tiny cells:

```tsx
// BEFORE
<SafeHtmlContent
  content={padlet.content}
  className="text-xs text-gray-600 line-clamp-2"
/>

// AFTER
<SafeHtmlContent
  content={padlet.content}
  mode="text"
  className="text-xs text-gray-600 line-clamp-2"
/>
```

This ensures comment JSON previews render cleanly as `"one (+1 more)"` instead of raw JSON or broken markup.

---

## 📊 New Props Reference

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `content` | `unknown` | required | Any content: string, HTML, JSON, comment array, etc. |
| `className` | `string` | `undefined` | CSS classes to apply |
| `mode` | `"auto" \| "html" \| "text"` | `"auto"` | Force rendering mode |
| `emptyFallback` | `ReactNode` | `null` | What to show if content is empty |
| `maxChars` | `number` | `undefined` | Truncate to N characters (for previews) |
| `preserveLineBreaks` | `boolean` | `false` | Keep line breaks in text mode |

---

## 🔄 Content Normalization Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                     INPUT: padlet.content                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 1: asString()                                               │
│ Convert to string safely (handles null, undefined, objects)      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 2: unwrapJson()                                             │
│ Parse JSON repeatedly (handles double-stringified)               │
│                                                                  │
│ "[{\"text\":\"hi\"}]" → [{"text":"hi"}]                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 3: extractCommentPreview()                                  │
│ If it's a comment array/object, extract human preview            │
│                                                                  │
│ [{"text":"one"},{"text":"two"}] → "two (+1 more)"               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 4: extractObjectPreview()                                   │
│ For generic objects, pick text/content/title/value/message       │
│                                                                  │
│ {"title":"Hello","meta":123} → "Hello"                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 5: decodeEntitiesDeep()                                     │
│ Decode HTML entities (supports double-encoding)                  │
│                                                                  │
│ "&amp;lt;p&amp;gt;" → "&lt;p&gt;" → "<p>"                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 6: looksLikeHtml()                                          │
│ Decide: render as HTML or plain text?                            │
│                                                                  │
│ mode="text" → always plain                                       │
│ mode="html" → always HTML                                        │
│ mode="auto" → check for HTML tags                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 7: sanitizeHtml() (if rendering as HTML)                    │
│ Remove dangerous tags/attributes before dangerouslySetInnerHTML  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        OUTPUT: Rendered                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📋 Implementation Checklist

### Phase 1: Replace Component ✅ DONE
- [x] ~~Backup existing `SafeHtmlContent.tsx`~~
- [x] Replace with new implementation
- [x] Verify no TypeScript errors

### Phase 2: Update Usages for Preview Contexts
- [ ] `TableLayout.tsx` — add `mode="text"`
- [ ] Any other compact/preview contexts — add `mode="text"`
- [ ] Full content views — keep `mode="auto"` (default)

### Phase 3: Testing
- [ ] Test comment post with JSON array content
- [ ] Test double-stringified JSON
- [ ] Test normal HTML content (`<p>Hello</p>`)
- [ ] Test encoded HTML (`&lt;p&gt;Hello&lt;/p&gt;`)
- [ ] Test double-encoded HTML (`&amp;lt;p&amp;gt;`)
- [ ] Test plain text content
- [ ] Test empty/null content
- [ ] Test object with nested fields

---

## 🧪 Test Cases

| Input | Expected Output |
|-------|-----------------|
| `"Hello world"` | `Hello world` |
| `"<p>Hello</p>"` | Rendered HTML paragraph |
| `"&lt;p&gt;Hello&lt;/p&gt;"` | Rendered HTML paragraph |
| `"&amp;lt;p&amp;gt;Hello&amp;lt;/p&amp;gt;"` | Rendered HTML paragraph |
| `'[{"text":"one"},{"text":"two"}]'` | `two (+1 more)` |
| `'{"comments":[{"text":"hi"}]}'` | `hi` |
| `'{"title":"My Title","data":123}'` | `My Title` |
| `'[[1,2],[3,4]]'` | Raw JSON (NOT treated as comments - no text/content fields) |
| `'[{"x":10,"y":20},{"x":30,"y":40}]'` | Raw JSON (NOT treated as comments - coordinates) |
| `null` | (empty or fallback) |
| `undefined` | (empty or fallback) |
| `""` | (empty or fallback) |

### Arrays That Should NOT Be Treated as Comments

| Input | Why Not Comments |
|-------|-----------------|
| `[[1,2,3],[4,5,6]]` | Table row data - no text/content fields |
| `[{"x":10,"y":20}]` | Drawing coordinates - no text/content fields |
| `[1, 2, 3, 4]` | Numeric array - not objects |
| `["a", "b", "c"]` | String array - not objects with text/content |

The `isCommentish()` check ensures only arrays with comment-like objects (having `text`, `content`, `html`, or `message` fields) are treated as comment previews.

---

## 💡 Important: Comment Posts and metadata.comments

For **comment-type posts**, the canonical source of comments is usually `padlet.metadata.comments[]`, NOT `padlet.content`.

`padlet.content` may contain:
- Legacy JSON payload (for backward compatibility)
- Double-stringified JSON from migrations
- The HTML of the "main" content area (not comments)

**Best practice for comment previews:**

```tsx
// In components that render comment posts specifically:
const comments = padlet.metadata?.comments || [];
const lastComment = comments[comments.length - 1];
const previewText = lastComment?.text || lastComment?.content || "";

// Use SafeHtmlContent for the actual text
<SafeHtmlContent content={previewText} mode="text" />
```

The `SafeHtmlContent` JSON normalization is a **fallback** for when content is JSON — but ideally, type-specific renderers (like `PostCardContent.tsx` for comments) should check `metadata.comments` directly.

---

## ⚠️ When to Use Each Mode

| Context | Recommended Mode | Why |
|---------|-----------------|-----|
| Table cells | `mode="text"` | Tiny cells can't render rich HTML well |
| Card previews | `mode="text"` | Keep previews compact and clean |
| Container child previews | `mode="text"` | Avoid layout breaking |
| Full post view | `mode="auto"` | Let rich HTML render properly |
| Modal/editor view | `mode="auto"` | Usually auto is fine; only use `mode="html"` if you're 100% confident the content is safe HTML |

> **⚠️ Note on `mode="html"`**: This mode forces HTML rendering regardless of content. Only use it when:
> - You've already sanitized the content server-side
> - You're confident the source is trusted
> - `mode="auto"` incorrectly detects content as plain text
> 
> In most cases, `mode="auto"` is the safer choice.

---

## 🔗 Related Files

This fix affects all places using `SafeHtmlContent`:

- `lib/collabboard/layouts/ColumnsLayout.tsx`
- `lib/collabboard/layouts/FreeformLayout.tsx`
- `lib/collabboard/layouts/GridLayout.tsx`
- `lib/collabboard/layouts/TableLayout.tsx` ← needs `mode="text"`
- `components/canvas/WallCanvas.tsx`
- `components/canvas/RowCanvas.tsx`
- `components/collabboard/ContainerChildPreviewCard.tsx`
- Any other component using `SafeHtmlContent`

---

## 📝 Summary

The original HTML rendering fix was correct for **HTML content**, but `padlet.content` can also store **JSON payloads** (especially for comment posts). The upgraded `SafeHtmlContent`:

1. **Unwraps JSON** automatically (including double-stringified)
2. **Extracts human-readable previews** from comment arrays
3. **Still handles HTML** correctly (with entity decoding)
4. **Still sanitizes** for security
5. **Adds `mode` prop** for control over rendering behavior

**Key insight**: Use `mode="text"` in compact/preview contexts (tables, cards) and `mode="auto"` in full content views.

---

*Generated: January 26, 2026*
*Fixes: JSON content rendering as nonsense in SafeHtmlContent*
