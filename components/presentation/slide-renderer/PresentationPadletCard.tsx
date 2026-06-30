"use client";

/* eslint-disable @next/next/no-img-element */

import React from "react";
import type { Padlet } from "@/types/collabboard";

type PresentationPadletCardProps = {
  padlet: Padlet;
  variant?: "default" | "compact";
};

function decodeHtmlEntities(text: string): string {
  if (typeof document === "undefined") return text;
  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;
  return textarea.value;
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function getPlainText(value: unknown, maxLength = 220): string {
  if (typeof value !== "string") return "";
  const trimmed = stripHtml(value);
  if (!trimmed) return "";
  return truncate(trimmed, maxLength);
}

function getContrastTextColor(bgColor: string): "#0f172a" | "#f8fafc" {
  const normalized = bgColor.trim();
  const hex = normalized.startsWith("#") ? normalized.slice(1) : normalized;
  const expanded = hex.length === 3 ? hex.split("").map((char) => char + char).join("") : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return "#0f172a";
  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  const toLinear = (channel: number) => {
    const scaled = channel / 255;
    return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return luminance > 0.45 ? "#0f172a" : "#f8fafc";
}

function getSurfaceColor(padlet: Padlet): string {
  return padlet.metadata?.cardColor || padlet.metadata?.backgroundColor || "#ffffff";
}

function getTextColor(padlet: Padlet): string {
  const background = getSurfaceColor(padlet);
  return padlet.metadata?.textColor || getContrastTextColor(background);
}

function getMutedTextColor(textColor: string): string {
  return textColor === "#f8fafc" ? "rgba(248,250,252,0.76)" : "rgba(15,23,42,0.66)";
}

function getImageSource(padlet: Padlet): string | null {
  return padlet.file_url
    || padlet.image_url
    || padlet.metadata?.imageUrl
    || padlet.metadata?.fileUrl
    || padlet.metadata?.linkImage
    || padlet.metadata?.previewUrl
    || padlet.metadata?.svgUrl
    || null;
}

function getTitle(padlet: Padlet): string {
  return padlet.title?.trim() || padlet.metadata?.linkTitle?.trim() || padlet.metadata?.todoTitle?.trim() || "Untitled";
}

function getSnippet(padlet: Padlet, maxLength: number): string {
  return getPlainText(
    padlet.metadata?.caption
      || padlet.metadata?.linkDescription
      || padlet.metadata?.linkCaption
      || padlet.content
      || "",
    maxLength,
  );
}

export default function PresentationPadletCard({
  padlet,
  variant = "default",
}: PresentationPadletCardProps) {
  const compact = variant === "compact";
  const backgroundColor = getSurfaceColor(padlet);
  const textColor = getTextColor(padlet);
  const mutedTextColor = getMutedTextColor(textColor);
  const borderColor = textColor === "#f8fafc" ? "rgba(255,255,255,0.18)" : "rgba(148,163,184,0.28)";
  const pillBackground = textColor === "#f8fafc" ? "rgba(255,255,255,0.16)" : "rgba(15,23,42,0.06)";
  const previewImage = getImageSource(padlet);
  const title = getTitle(padlet);
  const snippet = getSnippet(padlet, compact ? 90 : 180);
  const normalizedType = String(padlet.type ?? "").trim().toLowerCase();
  const displayMode = padlet.metadata?.displayMode || "both";
  const tasks = Array.isArray(padlet.metadata?.tasks) ? padlet.metadata.tasks : [];
  const completedTasks = tasks.filter((task) => task.completed).length;

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

  const topStrip = typeof padlet.metadata?.topStrip === "string" && padlet.metadata.topStrip !== "transparent"
    ? padlet.metadata.topStrip
    : null;

  if (normalizedType === "image" || (previewImage && (normalizedType === "file" || normalizedType === "card" || normalizedType === "drawing"))) {
    return (
      <div style={shellStyle}>
        {topStrip ? <div style={{ width: "100%", height: compact ? "5px" : "6px", flexShrink: 0, backgroundColor: topStrip }} /> : null}
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
            {(padlet.title || padlet.metadata?.caption) ? (
              <div
                style={{
                  position: "absolute",
                  left: compact ? "8px" : "12px",
                  right: compact ? "8px" : "12px",
                  bottom: compact ? "8px" : "12px",
                  padding: compact ? "6px 8px" : "8px 10px",
                  borderRadius: "0.65rem",
                  backgroundColor: "rgba(15,23,42,0.64)",
                  color: "#f8fafc",
                }}
              >
                <div style={{ fontSize: compact ? "11px" : "13px", fontWeight: 700, lineHeight: 1.2 }}>{title}</div>
                {snippet ? (
                  <div style={{ marginTop: "4px", fontSize: compact ? "10px" : "11px", lineHeight: 1.35, opacity: 0.92 }}>
                    {snippet}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: compact ? "12px" : "16px", fontSize: compact ? "11px" : "12px", color: mutedTextColor }}>
            No preview available
          </div>
        )}
      </div>
    );
  }

  if (normalizedType === "link") {
    const showMedia = displayMode !== "info-only";
    const showInfo = displayMode !== "image-only";
    return (
      <div style={shellStyle}>
        {topStrip ? <div style={{ width: "100%", height: compact ? "5px" : "6px", flexShrink: 0, backgroundColor: topStrip }} /> : null}
        {showMedia && previewImage ? (
          <div style={{ height: compact ? "44%" : "52%", minHeight: compact ? "54px" : "72px", backgroundColor: "rgba(15,23,42,0.04)" }}>
            <img
              src={previewImage}
              alt={title}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          </div>
        ) : null}
        <div style={{ padding: compact ? "10px" : "14px", display: "flex", flexDirection: "column", gap: compact ? "6px" : "8px", minHeight: 0 }}>
          {showInfo && padlet.metadata?.linkDomain ? (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
              {padlet.metadata?.linkFavicon ? (
                <img
                  src={padlet.metadata.linkFavicon}
                  alt=""
                  style={{ width: compact ? "12px" : "14px", height: compact ? "12px" : "14px", flexShrink: 0 }}
                />
              ) : null}
              <div style={{ fontSize: compact ? "10px" : "11px", color: mutedTextColor, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {padlet.metadata.linkDomain}
              </div>
            </div>
          ) : null}
          {showInfo ? <div style={{ fontSize: compact ? "12px" : "14px", fontWeight: 700, lineHeight: 1.25 }}>{title}</div> : null}
          {showInfo && snippet ? (
            <div style={{ fontSize: compact ? "10px" : "11px", lineHeight: 1.45, color: mutedTextColor }}>{snippet}</div>
          ) : null}
          {showInfo && padlet.metadata?.linkCaption ? (
            <div style={{ marginTop: "auto", fontSize: compact ? "10px" : "11px", lineHeight: 1.35, color: padlet.metadata.linkCaptionColor || mutedTextColor }}>
              {truncate(padlet.metadata.linkCaption, compact ? 70 : 120)}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (normalizedType === "todo" && tasks.length > 0) {
    return (
      <div style={shellStyle}>
        {topStrip ? <div style={{ width: "100%", height: compact ? "5px" : "6px", flexShrink: 0, backgroundColor: topStrip }} /> : null}
        <div style={{ padding: compact ? "10px" : "14px", display: "flex", flexDirection: "column", gap: compact ? "7px" : "8px", minHeight: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
            <div style={{ fontSize: compact ? "12px" : "14px", fontWeight: 700, lineHeight: 1.25, minWidth: 0 }}>{title}</div>
            <div style={{ flexShrink: 0, fontSize: compact ? "10px" : "11px", fontWeight: 600, color: mutedTextColor }}>
              {completedTasks}/{tasks.length}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: compact ? "5px" : "6px", minHeight: 0 }}>
            {tasks.slice(0, compact ? 3 : 4).map((task) => (
              <div key={task.id} style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                <div
                  style={{
                    width: compact ? "12px" : "14px",
                    height: compact ? "12px" : "14px",
                    marginTop: "1px",
                    flexShrink: 0,
                    borderRadius: "999px",
                    border: `1px solid ${task.completed ? "transparent" : borderColor}`,
                    backgroundColor: task.completed ? (task.color || "#22c55e") : "transparent",
                  }}
                />
                <div
                  style={{
                    fontSize: compact ? "10px" : "11px",
                    lineHeight: 1.35,
                    color: task.completed ? mutedTextColor : textColor,
                    textDecoration: task.completed ? "line-through" : "none",
                  }}
                >
                  {truncate(task.text, compact ? 52 : 84)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (normalizedType === "table") {
    let rows: string[][] = [];
    const tableValues = padlet.metadata?.tableValues;
    if (Array.isArray(tableValues)) {
      rows = tableValues
        .filter((row): row is unknown[] => Array.isArray(row))
        .slice(0, compact ? 3 : 4)
        .map((row) => row.slice(0, 2).map((cell) => getPlainText(cell, compact ? 18 : 28)));
    }

    return (
      <div style={shellStyle}>
        {topStrip ? <div style={{ width: "100%", height: compact ? "5px" : "6px", flexShrink: 0, backgroundColor: topStrip }} /> : null}
        <div style={{ padding: compact ? "10px" : "14px", display: "flex", flexDirection: "column", gap: compact ? "7px" : "8px", minHeight: 0 }}>
          <div style={{ fontSize: compact ? "12px" : "14px", fontWeight: 700, lineHeight: 1.25 }}>{title}</div>
          <div style={{ display: "grid", gap: "6px" }}>
            {rows.length > 0 ? rows.map((row, rowIndex) => (
              <div key={`${padlet.id}-${rowIndex}`} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                {row.map((cell, cellIndex) => (
                  <div
                    key={`${padlet.id}-${rowIndex}-${cellIndex}`}
                    style={{
                      minHeight: compact ? "22px" : "26px",
                      padding: compact ? "5px 6px" : "6px 8px",
                      borderRadius: "0.55rem",
                      backgroundColor: pillBackground,
                      fontSize: compact ? "10px" : "11px",
                      lineHeight: 1.35,
                    }}
                  >
                    {cell || "-"}
                  </div>
                ))}
              </div>
            )) : (
              <div style={{ fontSize: compact ? "10px" : "11px", lineHeight: 1.45, color: mutedTextColor }}>
                {snippet || "Table preview unavailable"}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={shellStyle}>
      {topStrip ? <div style={{ width: "100%", height: compact ? "5px" : "6px", flexShrink: 0, backgroundColor: topStrip }} /> : null}
      <div style={{ padding: compact ? "10px" : "14px", display: "flex", flexDirection: "column", gap: compact ? "7px" : "8px", minHeight: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "space-between" }}>
          <div style={{ minWidth: 0, fontSize: compact ? "12px" : "14px", fontWeight: 700, lineHeight: 1.25 }}>{title}</div>
          <div
            style={{
              flexShrink: 0,
              padding: compact ? "2px 6px" : "3px 8px",
              borderRadius: "999px",
              backgroundColor: pillBackground,
              color: mutedTextColor,
              fontSize: compact ? "9px" : "10px",
              fontWeight: 700,
              letterSpacing: "0.02em",
              textTransform: "uppercase",
            }}
          >
            {normalizedType || "padlet"}
          </div>
        </div>
        <div style={{ fontSize: compact ? "10px" : "11px", lineHeight: 1.5, color: mutedTextColor, whiteSpace: "pre-wrap" }}>
          {snippet || "No preview available"}
        </div>
      </div>
    </div>
  );
}
