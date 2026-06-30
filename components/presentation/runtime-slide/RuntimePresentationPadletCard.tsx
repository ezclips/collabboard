"use client";

/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-explicit-any */

import React from "react";
import type { Padlet } from "@/types/collabboard";
import RuntimePresentationContainerCard from "./RuntimePresentationContainerCard";

type RuntimePresentationPadletCardProps = {
  padlet: Padlet;
  allPadlets?: Padlet[];
};

// ── helpers ────────────────────────────────────────────────────────────────

function decodeHtmlEntities(text: string): string {
  if (typeof document === "undefined") return text;
  const ta = document.createElement("textarea");
  ta.innerHTML = text;
  return ta.value;
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function getPlainText(value: unknown): string {
  if (typeof value !== "string") return "";
  return stripHtml(value);
}

function getContrastTextColor(bgColor: string): "#0f172a" | "#f8fafc" {
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

function getSurface(p: Padlet) {
  return p.metadata?.cardColor || p.metadata?.backgroundColor || "#ffffff";
}
function getTextCol(p: Padlet) {
  return p.metadata?.textColor || getContrastTextColor(getSurface(p));
}
function getMuted(textColor: string) {
  return textColor === "#f8fafc" ? "rgba(248,250,252,0.76)" : "rgba(15,23,42,0.66)";
}
function getBorder(textColor: string) {
  return textColor === "#f8fafc" ? "rgba(255,255,255,0.18)" : "rgba(148,163,184,0.28)";
}
function getPillBg(textColor: string) {
  return textColor === "#f8fafc" ? "rgba(255,255,255,0.16)" : "rgba(15,23,42,0.06)";
}
function getImg(p: Padlet): string | null {
  return (
    p.file_url || p.image_url || p.metadata?.imageUrl || p.metadata?.fileUrl ||
    p.metadata?.linkImage || p.metadata?.previewUrl || p.metadata?.svgUrl || null
  );
}
function getTitle(p: Padlet): string {
  return p.title?.trim() || p.metadata?.linkTitle?.trim() || p.metadata?.todoTitle?.trim() || "Untitled";
}

/** Attempt to convert a public video URL to an embeddable iframe src */
function getVideoEmbedSrc(url: string | undefined): string | null {
  if (!url) return null;
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=0`;
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  return null;
}

// ── main export ────────────────────────────────────────────────────────────

export default function RuntimePresentationPadletCard({
  padlet,
  allPadlets = [],
}: RuntimePresentationPadletCardProps) {
  const backgroundColor = getSurface(padlet);
  const textColor = getTextCol(padlet);
  const mutedColor = getMuted(textColor);
  const borderColor = getBorder(textColor);
  const pillBg = getPillBg(textColor);
  const previewImage = getImg(padlet);
  const title = getTitle(padlet);
  const normalizedType = String(padlet.type ?? "").trim().toLowerCase();
  const displayMode = padlet.metadata?.displayMode || "both";
  const tasks = Array.isArray(padlet.metadata?.tasks) ? padlet.metadata.tasks : [];
  const completedTasks = tasks.filter((t: any) => t.completed).length;
  const topStrip =
    typeof padlet.metadata?.topStrip === "string" && padlet.metadata.topStrip !== "transparent"
      ? padlet.metadata.topStrip
      : null;

  const shellStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    borderRadius: "0.75rem",
    border: `1px solid ${borderColor}`,
    backgroundColor,
    color: textColor,
    boxShadow: "0 4px 12px rgba(15,23,42,0.12)",
  };

  // ── Container ─────────────────────────────────────────────────────────────
  if (normalizedType === "container") {
    return <RuntimePresentationContainerCard padlet={padlet} allPadlets={allPadlets} />;
  }

  // ── Image / File / Card / Drawing ─────────────────────────────────────────
  if (
    normalizedType === "image" ||
    (previewImage && (normalizedType === "file" || normalizedType === "card" || normalizedType === "drawing"))
  ) {
    return (
      <div style={shellStyle}>
        {topStrip && <div style={{ width: "100%", height: "6px", flexShrink: 0, backgroundColor: topStrip }} />}
        {previewImage ? (
          <div style={{ position: "relative", flex: 1, minHeight: 0, backgroundColor: "rgba(15,23,42,0.04)" }}>
            <img
              src={previewImage}
              alt={title}
              style={{
                width: "100%",
                height: "100%",
                objectFit: normalizedType === "card" || normalizedType === "drawing" ? "contain" : "cover",
                display: "block",
              }}
            />
            {(padlet.title || padlet.metadata?.caption) && (
              <div
                style={{
                  position: "absolute",
                  left: "12px", right: "12px", bottom: "12px",
                  padding: "8px 10px",
                  borderRadius: "0.65rem",
                  backgroundColor: "rgba(15,23,42,0.64)",
                  color: "#f8fafc",
                }}
              >
                <div style={{ fontSize: "13px", fontWeight: 700, lineHeight: 1.2 }}>{title}</div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: mutedColor, fontSize: "12px" }}>
            No preview
          </div>
        )}
      </div>
    );
  }

  // ── Link (with video embed attempt) ───────────────────────────────────────
  if (normalizedType === "link") {
    const linkUrl = padlet.metadata?.linkUrl;
    const videoSrc = getVideoEmbedSrc(linkUrl);
    const showMedia = displayMode !== "info-only";
    const showInfo = displayMode !== "image-only";

    if (videoSrc && showMedia) {
      return (
        <div style={shellStyle}>
          {topStrip && <div style={{ width: "100%", height: "6px", flexShrink: 0, backgroundColor: topStrip }} />}
          <div style={{ flex: 1, minHeight: 0, position: "relative", backgroundColor: "#000" }}>
            <iframe
              src={videoSrc}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ width: "100%", height: "100%", border: "none", display: "block" }}
              title={title}
            />
          </div>
          {showInfo && (
            <div style={{ padding: "10px 14px", flexShrink: 0 }}>
              <div style={{ fontSize: "13px", fontWeight: 700 }}>{title}</div>
            </div>
          )}
        </div>
      );
    }

    return (
      <div style={shellStyle}>
        {topStrip && <div style={{ width: "100%", height: "6px", flexShrink: 0, backgroundColor: topStrip }} />}
        {showMedia && previewImage && (
          <div style={{ height: "48%", minHeight: "60px", backgroundColor: "rgba(15,23,42,0.04)" }}>
            <img src={previewImage} alt={title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
        )}
        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "6px", flex: 1, minHeight: 0 }}>
          {showInfo && padlet.metadata?.linkDomain && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              {padlet.metadata?.linkFavicon && (
                <img src={padlet.metadata.linkFavicon} alt="" style={{ width: "14px", height: "14px", flexShrink: 0 }} />
              )}
              <div style={{ fontSize: "11px", color: mutedColor, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {padlet.metadata.linkDomain}
              </div>
            </div>
          )}
          {showInfo && <div style={{ fontSize: "14px", fontWeight: 700, lineHeight: 1.25 }}>{title}</div>}
          {showInfo && padlet.metadata?.linkDescription && (
            <div style={{ fontSize: "11px", lineHeight: 1.45, color: mutedColor, overflowY: "auto", flex: 1, minHeight: 0 }}>
              {padlet.metadata.linkDescription}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Todo ──────────────────────────────────────────────────────────────────
  if (normalizedType === "todo") {
    return (
      <div style={shellStyle}>
        {topStrip && <div style={{ width: "100%", height: "6px", flexShrink: 0, backgroundColor: topStrip }} />}
        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px", flex: 1, minHeight: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexShrink: 0 }}>
            <div style={{ fontSize: "14px", fontWeight: 700, lineHeight: 1.25, minWidth: 0 }}>{title}</div>
            <div style={{ flexShrink: 0, fontSize: "11px", fontWeight: 600, color: mutedColor }}>
              {completedTasks}/{tasks.length}
            </div>
          </div>
          {/* progress bar */}
          {tasks.length > 0 && (
            <div style={{ height: "4px", borderRadius: "2px", backgroundColor: pillBg, flexShrink: 0 }}>
              <div
                style={{
                  height: "100%",
                  borderRadius: "2px",
                  backgroundColor: "#22c55e",
                  width: `${(completedTasks / tasks.length) * 100}%`,
                  transition: "width 0.3s",
                }}
              />
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "5px", overflowY: "auto", flex: 1, minHeight: 0 }}>
            {tasks.map((task: any) => (
              <div key={task.id} style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                <div
                  style={{
                    width: "14px",
                    height: "14px",
                    marginTop: "1px",
                    flexShrink: 0,
                    borderRadius: "999px",
                    border: `1.5px solid ${task.completed ? "transparent" : borderColor}`,
                    backgroundColor: task.completed ? (task.color || "#22c55e") : "transparent",
                  }}
                />
                <div
                  style={{
                    fontSize: "11px",
                    lineHeight: 1.4,
                    color: task.completed ? mutedColor : textColor,
                    textDecoration: task.completed ? "line-through" : "none",
                  }}
                >
                  {task.text}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Table ─────────────────────────────────────────────────────────────────
  if (normalizedType === "table") {
    const tableValues = padlet.metadata?.tableValues;
    const rows: string[][] = Array.isArray(tableValues)
      ? (tableValues as unknown[])
          .filter((r): r is unknown[] => Array.isArray(r))
          .map((r) => (r as unknown[]).slice(0, 3).map((c) => getPlainText(c)))
      : [];

    return (
      <div style={shellStyle}>
        {topStrip && <div style={{ width: "100%", height: "6px", flexShrink: 0, backgroundColor: topStrip }} />}
        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px", flex: 1, minHeight: 0 }}>
          <div style={{ fontSize: "14px", fontWeight: 700, lineHeight: 1.25, flexShrink: 0 }}>{title}</div>
          <div style={{ overflowY: "auto", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: "5px" }}>
            {rows.length > 0 ? rows.map((row, ri) => (
              <div key={`${padlet.id}-${ri}`} style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(row.length, 3)}, 1fr)`, gap: "5px" }}>
                {row.map((cell, ci) => (
                  <div
                    key={`${padlet.id}-${ri}-${ci}`}
                    style={{
                      padding: "5px 8px",
                      borderRadius: "0.5rem",
                      backgroundColor: pillBg,
                      fontSize: "11px",
                      lineHeight: 1.35,
                    }}
                  >
                    {cell || "—"}
                  </div>
                ))}
              </div>
            )) : (
              <div style={{ fontSize: "11px", color: mutedColor }}>No data</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Text / Note / Comment / Default (scrollable body) ─────────────────────
  const body = getPlainText(padlet.content || "");

  return (
    <div style={shellStyle}>
      {topStrip && <div style={{ width: "100%", height: "6px", flexShrink: 0, backgroundColor: topStrip }} />}
      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "7px", flex: 1, minHeight: 0 }}>
        {/* Title row + type badge */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", justifyContent: "space-between", flexShrink: 0 }}>
          {title !== "Untitled" && (
            <div style={{ minWidth: 0, fontSize: "14px", fontWeight: 700, lineHeight: 1.25 }}>{title}</div>
          )}
          {normalizedType && normalizedType !== "text" && normalizedType !== "note" && normalizedType !== "comment" && (
            <div
              style={{
                flexShrink: 0,
                padding: "2px 8px",
                borderRadius: "999px",
                backgroundColor: pillBg,
                color: mutedColor,
                fontSize: "9px",
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              {normalizedType}
            </div>
          )}
        </div>
        {/* Full-content scrollable body */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            fontSize: "12px",
            lineHeight: 1.55,
            color: body ? textColor : mutedColor,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {body || "No content"}
        </div>
      </div>
    </div>
  );
}
