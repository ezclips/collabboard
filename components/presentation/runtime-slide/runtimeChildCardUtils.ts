"use client";

import type { Padlet } from "@/types/collabboard";

export function decodeHtmlEntities(text: string): string {
  if (typeof document === "undefined") return text;
  const ta = document.createElement("textarea");
  ta.innerHTML = text;
  return ta.value;
}

export function stripHtml(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

export function getPlainText(value: unknown): string {
  if (typeof value !== "string") return "";
  return stripHtml(value);
}

export function getContrastTextColor(bgColor: string): "#0f172a" | "#f8fafc" {
  const hex = bgColor.trim().replace(/^#/, "");
  const expanded = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return "#0f172a";
  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  const lin = (ch: number) => {
    const s = ch / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) > 0.45 ? "#0f172a" : "#f8fafc";
}

export function getSurface(padlet: Padlet): string {
  return padlet.metadata?.cardColor || padlet.metadata?.backgroundColor || "#ffffff";
}

export function getTextCol(padlet: Padlet): string {
  return padlet.metadata?.textColor || getContrastTextColor(getSurface(padlet));
}

export function getMuted(textColor: string): string {
  return textColor === "#f8fafc" ? "rgba(248,250,252,0.76)" : "rgba(15,23,42,0.66)";
}

export function getBorder(textColor: string): string {
  return textColor === "#f8fafc" ? "rgba(255,255,255,0.18)" : "rgba(148,163,184,0.28)";
}

export function getPillBg(textColor: string): string {
  return textColor === "#f8fafc" ? "rgba(255,255,255,0.16)" : "rgba(15,23,42,0.06)";
}

export function getImg(padlet: Padlet): string | null {
  const normalizedType = String(padlet.type ?? "").trim().toLowerCase();
  const svgUrl = padlet.metadata?.svgUrl;
  const svgLikeSource =
    typeof svgUrl === "string" &&
    svgUrl.length > 0 &&
    (
      normalizedType === "card" ||
      normalizedType === "drawing" ||
      padlet.file_type?.includes("svg") ||
      padlet.metadata?.importMimeType?.includes("svg") ||
      padlet.file_name?.toLowerCase().endsWith(".svg") ||
      padlet.metadata?.importFileName?.toLowerCase().endsWith(".svg")
    );

  if (svgLikeSource) {
    return svgUrl;
  }

  return (
    padlet.file_url || padlet.image_url || padlet.metadata?.imageUrl || padlet.metadata?.fileUrl ||
    padlet.metadata?.linkImage || padlet.metadata?.previewUrl || padlet.metadata?.svgUrl || null
  );
}

export function getTitle(padlet: Padlet): string {
  return padlet.title?.trim() || padlet.metadata?.linkTitle?.trim() || padlet.metadata?.todoTitle?.trim() || "Untitled";
}

export function getTopStrip(padlet: Padlet): string | null {
  return typeof padlet.metadata?.topStrip === "string" && padlet.metadata.topStrip !== "transparent"
    ? padlet.metadata.topStrip
    : null;
}

export function getVideoEmbedSrc(url: string | undefined): string | null {
  if (!url) return null;
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=0`;
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  return null;
}
