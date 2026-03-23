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
    const decoded = useMemo(() => decodeEntitiesDeep(trimmed), [trimmed]);
    const finalString = useMemo(() => {
        let s = decoded;

        if (!s.trim()) return "";

        if (!preserveLineBreaks) {
            s = collapseWhitespace(s);
        }

        if (typeof maxChars === "number" && maxChars > 0 && s.length > maxChars) {
            s = s.slice(0, maxChars).trimEnd() + "...";
        }

        return s;
    }, [decoded, maxChars, preserveLineBreaks]);
    const shouldRenderHtml = useMemo(() => {
        if (mode === "text") return false;
        if (mode === "html") return true;
        return looksLikeHtml(finalString);
    }, [mode, finalString]);
    const safeHtml = useMemo(() => sanitizeHtml(finalString), [finalString]);

    if (!finalString.trim()) {
        return emptyFallback ? <>{emptyFallback}</> : null;
    }

    if (!shouldRenderHtml) {
        return <span className={className}>{finalString}</span>;
    }

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
