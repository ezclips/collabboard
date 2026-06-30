"use client";

import React from "react";
import type { Padlet } from "@/types/collabboard";
import PresentationPadletCard from "./PresentationPadletCard";

type PresentationContainerCardProps = {
  padlet: Padlet;
  allPadlets: Padlet[];
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

function getPlainText(value: unknown, maxLength = 120): string {
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

function getContainerChildren(padlet: Padlet, allPadlets: Padlet[]): Padlet[] {
  const metadata = padlet.metadata ?? {};
  const childIds = Array.isArray(metadata.childPadletIds)
    ? metadata.childPadletIds.filter((id): id is string => typeof id === "string")
    : [];
  const linkedChildren = allPadlets.filter((candidate) => candidate.metadata?.parentId === padlet.id);

  return [
    ...childIds
      .map((childId) => allPadlets.find((candidate) => candidate.id === childId))
      .filter((candidate): candidate is Padlet => Boolean(candidate)),
    ...linkedChildren,
  ].filter((child, index, array) => array.findIndex((candidate) => candidate.id === child.id) === index);
}

function pickPrimaryChild(padlet: Padlet, children: Padlet[]): Padlet | null {
  const metadata = padlet.metadata ?? {};
  const explicitCoverId = [metadata.coverChildPadletId, metadata.coverPadletId, metadata.coverChildId]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);
  if (explicitCoverId) {
    const explicitChild = children.find((child) => child.id === explicitCoverId);
    if (explicitChild) return explicitChild;
  }

  const isImageChild = (child: Padlet) => (
    child.type === "image"
    || Boolean(child.file_url)
    || Boolean(child.image_url)
    || Boolean(child.metadata?.imageUrl)
    || Boolean(child.metadata?.fileUrl)
  );
  const isMediaOrLinkChild = (child: Padlet) => (
    child.type === "link"
    || child.type === "file"
    || Boolean(child.metadata?.linkUrl)
    || Boolean(child.metadata?.linkImage)
    || Boolean(child.metadata?.previewUrl)
    || Boolean(child.metadata?.svgUrl)
  );
  const isTextChild = (child: Padlet) => child.type === "note" || child.type === "text" || child.type === "todo";

  return children.find(isImageChild)
    || children.find(isMediaOrLinkChild)
    || children.find(isTextChild)
    || children[0]
    || null;
}

function getSnippet(container: Padlet, primaryChild: Padlet | null): string {
  const containerSnippet = getPlainText(container.content, 120);
  if (containerSnippet) return containerSnippet;

  if (!primaryChild) return "";
  return getPlainText(
    primaryChild.metadata?.caption
      || primaryChild.metadata?.linkDescription
      || primaryChild.metadata?.linkCaption
      || primaryChild.content
      || primaryChild.title
      || "",
    120,
  );
}

export default function PresentationContainerCard({
  padlet,
  allPadlets,
}: PresentationContainerCardProps) {
  const children = getContainerChildren(padlet, allPadlets);
  const primaryChild = pickPrimaryChild(padlet, children);
  const backgroundColor = padlet.metadata?.cardColor || padlet.metadata?.backgroundColor || "#ffffff";
  const textColor = padlet.metadata?.textColor || getContrastTextColor(backgroundColor);
  const mutedTextColor = textColor === "#f8fafc" ? "rgba(248,250,252,0.78)" : "rgba(15,23,42,0.66)";
  const badgeBackground = textColor === "#f8fafc" ? "rgba(255,255,255,0.16)" : "rgba(15,23,42,0.06)";
  const borderColor = textColor === "#f8fafc" ? "rgba(255,255,255,0.18)" : "rgba(148,163,184,0.28)";
  const topStrip = typeof padlet.metadata?.topStrip === "string" && padlet.metadata.topStrip !== "transparent"
    ? padlet.metadata.topStrip
    : null;
  const snippet = getSnippet(padlet, primaryChild);

  return (
    <div
      style={{
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
      }}
    >
      {topStrip ? <div style={{ width: "100%", height: "6px", flexShrink: 0, backgroundColor: topStrip }} /> : null}
      <div style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "10px", flex: 1, minHeight: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "14px", fontWeight: 700, lineHeight: 1.2 }}>
              {padlet.title?.trim() || "Container"}
            </div>
            {snippet ? (
              <div style={{ marginTop: "6px", fontSize: "11px", lineHeight: 1.45, color: mutedTextColor }}>
                {snippet}
              </div>
            ) : null}
          </div>
          <div
            style={{
              flexShrink: 0,
              padding: "4px 8px",
              borderRadius: "999px",
              backgroundColor: badgeBackground,
              color: mutedTextColor,
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.02em",
            }}
          >
            {children.length} {children.length === 1 ? "item" : "items"}
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", borderRadius: "0.7rem" }}>
          {primaryChild ? (
            <PresentationPadletCard padlet={primaryChild} variant="compact" />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                minHeight: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "14px",
                borderRadius: "0.7rem",
                backgroundColor: badgeBackground,
                fontSize: "11px",
                lineHeight: 1.4,
                color: mutedTextColor,
                textAlign: "center",
              }}
            >
              {snippet || "Container preview unavailable"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
