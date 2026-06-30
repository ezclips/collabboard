"use client";

import React from "react";
import type { Padlet } from "@/types/collabboard";
import RuntimeContainerChildCard from "./RuntimeContainerChildCard";
import {
  getBorder,
  getMuted,
  getPillBg,
  getPlainText,
  getSurface,
  getTextCol,
  getTopStrip,
} from "./runtimeChildCardUtils";
import { resolveRuntimeContainerChildren } from "./resolveRuntimeContainerChildren";

type RuntimePresentationContainerCardProps = {
  padlet: Padlet;
  allPadlets: Padlet[];
};

export default function RuntimePresentationContainerCard({
  padlet,
  allPadlets,
}: RuntimePresentationContainerCardProps) {
  const backgroundColor = getSurface(padlet);
  const textColor = getTextCol(padlet);
  const mutedColor = getMuted(textColor);
  const borderColor = getBorder(textColor);
  const pillBg = getPillBg(textColor);
  const topStrip = getTopStrip(padlet);
  const children = resolveRuntimeContainerChildren(padlet, allPadlets);

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

  return (
    <div style={shellStyle}>
      {topStrip && <div style={{ width: "100%", height: "6px", flexShrink: 0, backgroundColor: topStrip }} />}
      <div
        style={{
          padding: "12px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: "14px",
              fontWeight: 700,
              lineHeight: 1.2,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {padlet.title?.trim() || "Container"}
          </div>
          <div
            style={{
              flexShrink: 0,
              padding: "2px 8px",
              borderRadius: "999px",
              backgroundColor: pillBg,
              color: mutedColor,
              fontSize: "10px",
              fontWeight: 700,
            }}
          >
            {children.length} {children.length === 1 ? "item" : "items"}
          </div>
        </div>

        {padlet.content ? (
          <div
            style={{
              fontSize: "11px",
              lineHeight: 1.45,
              color: mutedColor,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              flexShrink: 0,
            }}
          >
            {getPlainText(padlet.content)}
          </div>
        ) : null}

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          {children.map((child) => (
            <RuntimeContainerChildCard key={child.id} padlet={child} />
          ))}
          {children.length === 0 && (
            <div style={{ fontSize: "11px", color: mutedColor, fontStyle: "italic" }}>No items</div>
          )}
        </div>
      </div>
    </div>
  );
}
