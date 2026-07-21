"use client";

/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-explicit-any */

import React from "react";
import type { Padlet } from "@/types/collabboard";
import AIContentRenderer from "@/components/ai/AIContentRenderer";
import { extractAIContentFromPadletMetadata } from "@/lib/ai/normalize-ai-content";
import {
  getBorder,
  getImg,
  getMuted,
  getPillBg,
  getPlainText,
  getSurface,
  getTextCol,
  getTitle,
  getTopStrip,
  getVideoEmbedSrc,
} from "./runtimeChildCardUtils";

type RuntimeContainerChildCardProps = {
  padlet: Padlet;
};

function getDomain(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function getFallbackBody(padlet: Padlet): string {
  return getPlainText(
    padlet.content ||
      padlet.metadata?.caption ||
      padlet.metadata?.linkDescription ||
      padlet.metadata?.linkCaption ||
      padlet.file_name ||
      padlet.metadata?.importFileName ||
      ""
  );
}

function normalizeOverlayText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export default function RuntimeContainerChildCard({
  padlet,
}: RuntimeContainerChildCardProps) {
  const normalizedType = String(padlet.type ?? "").trim().toLowerCase();
  const backgroundColor = getSurface(padlet);
  const textColor = getTextCol(padlet);
  const mutedColor = getMuted(textColor);
  const borderColor = getBorder(textColor);
  const pillBg = getPillBg(textColor);
  const previewImage = getImg(padlet);
  const title = getTitle(padlet);
  const topStrip = getTopStrip(padlet);
  const fallbackBody = getFallbackBody(padlet);
  const isVisualMediaType =
    normalizedType === "image" ||
    normalizedType === "file" ||
    normalizedType === "card" ||
    normalizedType === "drawing";

  const shellStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    borderRadius: "0.75rem",
    border: `1px solid ${borderColor}`,
    backgroundColor,
    color: textColor,
    boxShadow: "0 4px 12px rgba(15,23,42,0.12)",
  };

  const mediaShellStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  };

  const scrollBodyStyle: React.CSSProperties = {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
  };

  if (normalizedType === "ai-component") {
    const aiContent = extractAIContentFromPadletMetadata(padlet.metadata) ?? { html: "" };
    return (
      <div style={shellStyle}>
        <AIContentRenderer
          content={aiContent}
          legacyHtmlProps={{
            padletId: padlet.id,
            width: Number(padlet.width) || 500,
            height: Number(padlet.height) || 400,
            isExpanded: true,
          }}
        />
      </div>
    );
  }

  if (
    normalizedType === "image" ||
    isVisualMediaType
  ) {
    const explicitTitle = getPlainText(padlet.title).trim();
    const explicitCaption = getPlainText(padlet.metadata?.caption).trim();
    const normalizedTitle = normalizeOverlayText(explicitTitle);
    const normalizedCaption = normalizeOverlayText(explicitCaption);
    const meaningfulTitle =
      normalizedTitle.length > 0 &&
      normalizedTitle !== "image" &&
      normalizedTitle !== "untitled"
        ? explicitTitle
        : "";
    const meaningfulCaption =
      normalizedCaption.length > 0 &&
      normalizedCaption !== normalizedTitle
        ? explicitCaption
        : "";
    const hasCaptionOverlay = Boolean(meaningfulTitle || meaningfulCaption);
    const visualFit =
      normalizedType === "card" ||
      normalizedType === "drawing" ||
      previewImage?.toLowerCase().includes(".svg");
    const isRasterImageChild =
      normalizedType === "image" ||
      (normalizedType === "file" && !previewImage?.toLowerCase().includes(".svg"));
    const rootStyle = isRasterImageChild ? mediaShellStyle : shellStyle;
    const mediaBodyStyle: React.CSSProperties = isRasterImageChild
      ? {
          width: "100%",
          height: "100%",
          position: "relative",
          borderRadius: "0.75rem",
          overflow: "hidden",
        }
      : {
          position: "relative",
          flex: 1,
          minHeight: 0,
          height: "100%",
          display: "flex",
          backgroundColor: "rgba(15,23,42,0.04)",
        };

    return (
      <div style={rootStyle}>
        {topStrip && <div style={{ width: "100%", height: "6px", flexShrink: 0, backgroundColor: topStrip }} />}
        <div style={mediaBodyStyle}>
          {previewImage ? (
            <img
              src={previewImage}
              alt={title}
              style={{
                width: "100%",
                height: "100%",
                ...(isRasterImageChild ? null : { flex: 1 }),
                objectFit: isRasterImageChild ? "cover" : visualFit ? "contain" : "cover",
                display: "block",
              }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "12px",
                color: mutedColor,
                fontSize: "12px",
                textAlign: "center",
              }}
            >
              No preview
            </div>
          )}
          {hasCaptionOverlay && (
            <div
              style={{
                position: "absolute",
                left: "12px",
                right: "12px",
                bottom: "12px",
                padding: "8px 10px",
                borderRadius: "0.65rem",
                backgroundColor: "rgba(15,23,42,0.64)",
                color: "#f8fafc",
                display: "flex",
                flexDirection: "column",
                gap: "3px",
              }}
            >
              {meaningfulTitle && (
                <div style={{ fontSize: "13px", fontWeight: 700, lineHeight: 1.2 }}>{meaningfulTitle}</div>
              )}
              {meaningfulCaption && (
                <div
                  style={{
                    fontSize: "11px",
                    lineHeight: 1.35,
                    color: "rgba(248,250,252,0.84)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {meaningfulCaption}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (normalizedType === "link") {
    const linkUrl = padlet.metadata?.linkUrl;
    const videoSrc = getVideoEmbedSrc(linkUrl);
    const showMedia = padlet.metadata?.displayMode !== "info-only";
    const showInfo = padlet.metadata?.displayMode !== "image-only";
    const domain = padlet.metadata?.linkDomain || getDomain(linkUrl);
    const linkDescription = getPlainText(padlet.metadata?.linkDescription);
    const linkCaption = getPlainText(padlet.metadata?.linkCaption);
    const infoText = linkDescription || linkCaption;
    const normalizedTitleText = getPlainText(title);
    const loweredTitleText = normalizedTitleText.toLowerCase();
    const loweredDomain = domain.toLowerCase();
    const hasUsefulTitle =
      Boolean(normalizedTitleText) &&
      loweredTitleText !== "untitled" &&
      loweredTitleText !== "image" &&
      loweredTitleText !== "video" &&
      loweredTitleText !== loweredDomain;
    const hasInfoSection = showInfo && Boolean(domain || hasUsefulTitle || infoText);

    if (videoSrc && showMedia) {
      const explicitCaption = getPlainText(padlet.metadata?.caption);
      const hasExplicitCaption = explicitCaption.trim().length > 0;

      return (
        <div style={shellStyle}>
          {topStrip && <div style={{ width: "100%", height: "6px", flexShrink: 0, backgroundColor: topStrip }} />}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              height: "100%",
              display: "flex",
              backgroundColor: "#000",
            }}
          >
            <iframe
              src={videoSrc}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ width: "100%", height: "100%", flex: 1, border: "none", display: "block" }}
              title={title}
            />
          </div>
          {hasExplicitCaption && (
            <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: "4px", flexShrink: 0 }}>
              <div style={{ fontSize: "11px", lineHeight: 1.45, color: mutedColor, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {explicitCaption}
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <div style={shellStyle}>
        {topStrip && <div style={{ width: "100%", height: "6px", flexShrink: 0, backgroundColor: topStrip }} />}
        {showMedia && previewImage && (
          <div style={{ height: "48%", minHeight: "60px", flexShrink: 0, backgroundColor: "rgba(15,23,42,0.04)" }}>
            <img src={previewImage} alt={title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
        )}
        <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: "6px", ...scrollBodyStyle }}>
          {showInfo && domain && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
              {padlet.metadata?.linkFavicon && (
                <img src={padlet.metadata.linkFavicon} alt="" style={{ width: "14px", height: "14px", flexShrink: 0 }} />
              )}
              <div style={{ fontSize: "11px", color: mutedColor, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {domain}
              </div>
            </div>
          )}
          {showInfo && <div style={{ fontSize: "13px", fontWeight: 700, lineHeight: 1.25 }}>{title}</div>}
          {showInfo && (padlet.metadata?.linkDescription || padlet.metadata?.linkCaption || linkUrl) && (
            <div style={{ fontSize: "11px", lineHeight: 1.45, color: mutedColor, whiteSpace: "pre-wrap", wordBreak: "break-word", ...scrollBodyStyle }}>
              {padlet.metadata?.linkDescription || padlet.metadata?.linkCaption || linkUrl}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (normalizedType === "todo") {
    const tasks = Array.isArray(padlet.metadata?.tasks) ? padlet.metadata.tasks : [];
    const completedTasks = tasks.filter((task: any) => task.completed).length;

    return (
      <div style={shellStyle}>
        {topStrip && <div style={{ width: "100%", height: "6px", flexShrink: 0, backgroundColor: topStrip }} />}
        <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: "8px", flex: 1, minHeight: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexShrink: 0 }}>
            <div style={{ fontSize: "13px", fontWeight: 700, lineHeight: 1.25, minWidth: 0 }}>{title}</div>
            <div style={{ flexShrink: 0, fontSize: "11px", fontWeight: 600, color: mutedColor }}>
              {completedTasks}/{tasks.length}
            </div>
          </div>
          {tasks.length > 0 && (
            <div style={{ height: "4px", borderRadius: "2px", backgroundColor: pillBg, flexShrink: 0 }}>
              <div
                style={{
                  height: "100%",
                  borderRadius: "2px",
                  backgroundColor: "#22c55e",
                  width: `${(completedTasks / tasks.length) * 100}%`,
                }}
              />
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", ...scrollBodyStyle }}>
            {tasks.length > 0 ? tasks.map((task: any) => (
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
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {task.text}
                </div>
              </div>
            )) : (
              <div style={{ fontSize: "11px", color: mutedColor }}>No tasks</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (normalizedType === "table") {
    const tableValues = Array.isArray(padlet.metadata?.tableValues) ? padlet.metadata.tableValues : [];
    const rows: string[][] = tableValues
      .filter((row): row is unknown[] => Array.isArray(row))
      .map((row) => row.slice(0, 4).map((cell) => getPlainText(cell) || "—"));

    return (
      <div style={shellStyle}>
        {topStrip && <div style={{ width: "100%", height: "6px", flexShrink: 0, backgroundColor: topStrip }} />}
        <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: "8px", flex: 1, minHeight: 0 }}>
          <div style={{ fontSize: "13px", fontWeight: 700, lineHeight: 1.25, flexShrink: 0 }}>{title}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", ...scrollBodyStyle }}>
            {rows.length > 0 ? rows.map((row, rowIndex) => (
              <div key={`${padlet.id}-${rowIndex}`} style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(row.length, 4)}, minmax(0, 1fr))`, gap: "6px" }}>
                {row.map((cell, cellIndex) => (
                  <div
                    key={`${padlet.id}-${rowIndex}-${cellIndex}`}
                    style={{
                      padding: "6px 8px",
                      borderRadius: "0.5rem",
                      backgroundColor: pillBg,
                      fontSize: "11px",
                      lineHeight: 1.35,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {cell}
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

  const isTextLike = normalizedType === "text" || normalizedType === "note" || normalizedType === "comment" || normalizedType === "";

  return (
    <div style={shellStyle}>
      {topStrip && <div style={{ width: "100%", height: "6px", flexShrink: 0, backgroundColor: topStrip }} />}
      <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: "7px", flex: 1, minHeight: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px", flexShrink: 0 }}>
          {title !== "Untitled" && (
            <div style={{ minWidth: 0, fontSize: "13px", fontWeight: 700, lineHeight: 1.25 }}>
              {title}
            </div>
          )}
          {!isTextLike && (
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
        <div
          style={{
            ...scrollBodyStyle,
            fontSize: "12px",
            lineHeight: 1.55,
            color: fallbackBody ? textColor : mutedColor,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {fallbackBody || "No content"}
        </div>
      </div>
    </div>
  );
}
