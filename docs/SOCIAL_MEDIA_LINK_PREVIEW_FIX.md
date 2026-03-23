# Social Media Link Preview Fix

## 🎯 The Goal

Make **all social/video links** (YouTube, X, Facebook, TikTok, Instagram, LinkedIn, Vimeo, etc.) display correctly as rich link previews inside containers — without platform-specific code.

---

## 🔑 Key Principle: Metadata-Driven Rendering

Instead of writing special code for each platform, we:

1. **Treat all social/video links as `type: "link"`**
2. **Render from metadata** (populated by your link scraper)
3. **Only add light heuristics** for edge cases (e.g., YouTube thumbnail fallback)

This means **any platform works automatically** if your link-metadata pipeline populates:

| Field | Description | Example |
|-------|-------------|---------|
| `metadata.linkUrl` | The actual URL | `https://youtube.com/watch?v=abc123` |
| `metadata.linkTitle` | Page/video title | `"Amazing Video Title"` |
| `metadata.linkDomain` | Domain for display | `youtube.com` |
| `metadata.linkImage` | Thumbnail/preview image | `https://img.youtube.com/vi/abc123/hqdefault.jpg` |
| `metadata.linkFavicon` | Site favicon | `https://youtube.com/favicon.ico` |
| `metadata.linkDescription` | Description/excerpt | `"This video shows..."` |

---

## ✅ What This Fix Adds

| Feature | Description |
|---------|-------------|
| **Universal link previews** | YouTube, X, Facebook, TikTok, Instagram, LinkedIn, Vimeo, etc. all work |
| **Video play overlay** | Shows ▶️ badge for video-type links |
| **Favicon display** | Shows site favicon next to domain |
| **YouTube fallback** | Derives thumbnail from URL if metadata is missing |
| **Graceful degradation** | Falls back to URL/title if metadata is incomplete |

---

## 🛠️ Implementation

### Replace ContainerChildPreviewCard.tsx

Replace `components/collabboard/ContainerChildPreviewCard.tsx` with this complete version:

```tsx
"use client";

import React, { useMemo } from "react";
import {
  X,
  MessageCircle,
  StickyNote,
  Link2,
  ListTodo,
  Image as ImageIcon,
  Table as TableIcon,
  Pencil,
  Play,
} from "lucide-react";
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

function getHost(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || url;
  }
}

function isLikelyVideoUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes("youtube.com/") ||
    u.includes("youtu.be/") ||
    u.includes("vimeo.com/") ||
    u.includes("tiktok.com/") ||
    u.includes("x.com/") ||
    u.includes("twitter.com/") ||
    u.includes("instagram.com/") ||
    u.includes("facebook.com/") ||
    u.includes("fb.watch/") ||
    u.includes("twitch.tv/") ||
    u.includes("kick.com/") ||
    u.includes("rumble.com/") ||
    u.includes("dailymotion.com/") ||
    u.includes("loom.com/")
  );
}

// For the cases where metadata doesn't include a thumbnail, derive YouTube thumb from URL.
function deriveYoutubeThumb(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const host = u.hostname.replace(/^www\./, "");
    let id = "";

    if (host === "youtu.be") {
      id = u.pathname.replace("/", "");
    } else if (host.includes("youtube.com")) {
      id = u.searchParams.get("v") || "";
      if (!id && u.pathname.includes("/shorts/")) {
        const parts = u.pathname.split("/shorts/");
        id = (parts[1] || "").split("/")[0];
      }
    }

    if (!id) return "";
    return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
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

function getImageSrc(p: Padlet): string {
  const anyP = p as any;
  return (
    asString(anyP.file_url).trim() ||
    asString(anyP.metadata?.imageUrl).trim() ||
    asString(anyP.metadata?.fileUrl).trim() ||
    (typeof anyP.content === "string" && anyP.content.startsWith("http") ? anyP.content : "") ||
    ""
  );
}

export default function ContainerChildPreviewCard({ padlet, onRemove, className }: Props) {
  const type = normalizeType(padlet.type);

  // Only comment if explicit type or metadata.comments exists.
  const isComment = type === "comment" || Array.isArray((padlet as any)?.metadata?.comments);

  const meta = (padlet as any)?.metadata ?? {};

  // Link metadata (works for ANY social media if your link-scraper populates it)
  const linkUrl = asString(meta?.linkUrl).trim() || asString(padlet.content).trim();
  const linkTitle = asString(meta?.linkTitle).trim();
  const linkDomain = asString(meta?.linkDomain).trim() || (linkUrl ? getHost(linkUrl) : "");
  const linkDesc = asString(meta?.linkDescription).trim();
  const linkImageRaw = asString(meta?.linkImage).trim();
  const linkFavicon = asString(meta?.linkFavicon).trim();

  // Fallback: derive YouTube thumbnail when metadata didn't provide one
  const youtubeThumb = linkUrl ? deriveYoutubeThumb(linkUrl) : "";
  const linkImage = linkImageRaw || youtubeThumb;

  const showVideoBadge = type === "link" && linkUrl && isLikelyVideoUrl(linkUrl);

  // Todo
  const tasks = Array.isArray(meta?.tasks) ? meta.tasks : [];

  // Image
  const imageSrc = getImageSrc(padlet);

  // Drawing preview
  const drawingPreview = asString(meta?.previewUrl).trim();

  const { preview: commentPreview, count: commentCount } = useMemo(
    () => (isComment ? pickLastCommentPreview(padlet) : { preview: "", count: 0 }),
    [isComment, padlet]
  );

  const title = isComment
    ? "Comment"
    : type === "link"
      ? "Link"
      : type === "todo"
        ? "To-Do"
        : type === "image"
          ? "Image"
          : type === "table"
            ? "Table"
            : type === "drawing"
              ? "Drawing"
              : "Note";

  const Icon = isComment
    ? MessageCircle
    : type === "link"
      ? Link2
      : type === "todo"
        ? ListTodo
        : type === "image"
          ? ImageIcon
          : type === "table"
            ? TableIcon
            : type === "drawing"
              ? Pencil
              : StickyNote;

  return (
    <div className={`relative rounded-lg border bg-white shadow-sm ${className ?? ""}`}>
      <div className={`absolute left-0 top-0 h-full w-1 rounded-l-lg ${isComment ? "bg-yellow-400" : "bg-orange-400"}`} />

      <div className="flex items-start gap-3 p-3 pl-4">
        <div className="mt-0.5 flex min-w-0 flex-1 items-start gap-2">
          <Icon className={`h-4 w-4 shrink-0 ${isComment ? "text-teal-500" : "text-gray-500"}`} />

          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-gray-800">{title}</div>

            {/* ========= LINK PREVIEW (all social/video/etc.) ========= */}
            {type === "link" && !isComment && (
              <div className="mt-2 space-y-2">
                {linkImage && (
                  <div className="relative overflow-hidden rounded-md border bg-gray-50">
                    <img
                      src={linkImage}
                      alt=""
                      className="h-24 w-full object-cover"
                      onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                    />
                    {showVideoBadge && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60">
                          <Play className="h-5 w-5 text-white" />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex min-w-0 items-start gap-2">
                  {linkFavicon ? (
                    <img
                      src={linkFavicon}
                      alt=""
                      className="mt-0.5 h-4 w-4 rounded"
                      onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                    />
                  ) : (
                    <div className="mt-0.5 h-4 w-4 rounded bg-gray-100" />
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-blue-700">
                      {linkTitle || linkUrl || "Untitled link"}
                    </div>
                    <div className="truncate text-[11px] text-gray-500">{linkDomain || linkUrl}</div>
                    {linkDesc && <div className="mt-1 line-clamp-2 text-[11px] text-gray-600">{linkDesc}</div>}
                  </div>
                </div>
              </div>
            )}

            {/* ========= IMAGE PREVIEW ========= */}
            {type === "image" && !isComment && (
              <div className="mt-2 space-y-2">
                {imageSrc ? (
                  <div className="overflow-hidden rounded-md border bg-gray-50">
                    <img
                      src={imageSrc}
                      alt=""
                      className="h-24 w-full object-cover"
                      onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                    />
                  </div>
                ) : (
                  <div className="text-[12px] text-gray-500">No image source</div>
                )}
              </div>
            )}

            {/* ========= DRAWING PREVIEW ========= */}
            {type === "drawing" && !isComment && (
              <div className="mt-2 space-y-2">
                {drawingPreview ? (
                  <div className="overflow-hidden rounded-md border bg-gray-50">
                    <img
                      src={drawingPreview}
                      alt=""
                      className="h-24 w-full object-contain"
                      onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                    />
                  </div>
                ) : (
                  <div className="text-[12px] text-gray-500">Click to view drawing</div>
                )}
              </div>
            )}

            {/* ========= TABLE PREVIEW (placeholder) ========= */}
            {type === "table" && !isComment && (
              <div className="mt-2">
                <SafeHtmlContent
                  content={padlet.title || "Table"}
                  className="block text-xs text-gray-700 line-clamp-1"
                  mode="text"
                />
                <div className="mt-1 text-[11px] text-gray-500">Table content</div>
              </div>
            )}

            {/* ========= TODO PREVIEW ========= */}
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
                    {tasks.length > 3 && <div className="text-[11px] text-gray-500">+{tasks.length - 3} more</div>}
                  </>
                ) : (
                  <div className="text-[12px] text-gray-500">No tasks</div>
                )}
              </div>
            )}

            {/* ========= COMMENT PREVIEW ========= */}
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

            {/* ========= DEFAULT TEXT PREVIEW ========= */}
            {!isComment && !["link", "todo", "image", "table", "drawing"].includes(type) && (
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

## 📊 Supported Platforms

All these platforms work **automatically** if your link scraper populates metadata:

| Platform | Video Badge | Notes |
|----------|-------------|-------|
| YouTube | ✅ | Fallback thumbnail from URL if metadata missing |
| YouTube Shorts | ✅ | Extracts ID from `/shorts/` path |
| Vimeo | ✅ | |
| TikTok | ✅ | |
| X (Twitter) | ✅ | |
| Instagram | ✅ | |
| Facebook | ✅ | |
| fb.watch | ✅ | |
| Twitch | ✅ | |
| Kick | ✅ | |
| Rumble | ✅ | |
| Dailymotion | ✅ | |
| Loom | ✅ | |
| Any other link | ❌ | Shows as regular link preview |

---

## 🔧 Helper Functions

### `isLikelyVideoUrl(url)`

Checks if URL is from a video platform to show the ▶️ play overlay:

```typescript
function isLikelyVideoUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes("youtube.com/") ||
    u.includes("youtu.be/") ||
    u.includes("vimeo.com/") ||
    u.includes("tiktok.com/") ||
    // ... etc
  );
}
```

### `deriveYoutubeThumb(url)`

Fallback for when metadata doesn't include a thumbnail:

```typescript
function deriveYoutubeThumb(url: string): string {
  // Extracts video ID from:
  // - youtube.com/watch?v=ID
  // - youtu.be/ID
  // - youtube.com/shorts/ID
  // Returns: https://img.youtube.com/vi/ID/hqdefault.jpg
}
```

### `getHost(url)`

Extracts clean domain name:

```typescript
function getHost(url: string): string {
  // "https://www.youtube.com/watch?v=abc" → "youtube.com"
}
```

---

## 🖼️ Visual Structure

```
┌─────────────────────────────────────────────┐
│ ▌ 🔗 Link                                   │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │                                     │   │
│  │         Thumbnail Image             │   │
│  │              ▶️                      │   │  ← Play overlay (video only)
│  │                                     │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  🌐 Video Title Here                        │  ← Title (blue, linked)
│     youtube.com                             │  ← Domain (gray)
│     Description text if available...        │  ← Description (gray, 2 lines max)
│                                             │
└─────────────────────────────────────────────┘
```

---

## 📋 Post Type Rendering Matrix

| Type | Preview Content | Source |
|------|-----------------|--------|
| `link` | Thumbnail + title + domain + description | `metadata.link*` |
| `todo` | Task checklist (first 3 items) | `metadata.tasks[]` |
| `comment` | Last comment text + count | `metadata.comments[]` |
| `image` | Image thumbnail | `file_url` or `metadata.imageUrl` |
| `drawing` | Drawing preview | `metadata.previewUrl` |
| `table` | Title + "Table content" | `padlet.title` |
| `text` (default) | Rich text content | `padlet.content` via SafeHtmlContent |

---

## ⚠️ Prerequisites

For social media links to display correctly, your **link metadata fetcher** must populate:

```typescript
// When saving a link post, fetch and store:
metadata: {
  linkUrl: "https://youtube.com/watch?v=abc123",
  linkTitle: "Video Title",
  linkDomain: "youtube.com",
  linkImage: "https://img.youtube.com/vi/abc123/hqdefault.jpg",
  linkFavicon: "https://youtube.com/favicon.ico",
  linkDescription: "Video description..."
}
```

If your link scraper already does this, **all platforms work automatically**.

---

## 🧪 Testing Checklist

- [ ] YouTube video link → shows thumbnail + ▶️ + title + domain
- [ ] YouTube Shorts → shows thumbnail + ▶️ + title
- [ ] X (Twitter) link → shows preview image + title + domain
- [ ] TikTok link → shows thumbnail + ▶️ + title
- [ ] Instagram link → shows preview + title
- [ ] Regular website link → shows preview (no ▶️)
- [ ] Link with missing metadata → falls back to URL
- [ ] Link with no thumbnail → YouTube fallback works (if YouTube)
- [ ] Todo post → shows task list (not link preview)
- [ ] Comment post → shows last comment (not link preview)
- [ ] Text post → shows rich HTML content

---

## 📝 Summary

**The key insight**: Social media support is "free" if metadata is correct.

Instead of writing platform-specific rendering code, we:
1. Store consistent metadata for all links
2. Render all links the same way (thumbnail + title + domain)
3. Add video badge based on URL pattern
4. Provide YouTube thumbnail fallback for edge cases

This makes the code **simpler** and **more maintainable** while supporting **more platforms**.

---

*Generated: January 26, 2026*
*Fixes: Social media links (YouTube, X, TikTok, etc.) now display as rich link previews*
