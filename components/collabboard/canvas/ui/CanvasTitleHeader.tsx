"use client";

import React from 'react';

export const CANVAS_TITLE_HEADER_HEIGHT = 56;

interface CanvasTitleHeaderProps {
  title: string;
  description?: string;
  icon?: string;
  showTitle: boolean;
  showDescription: boolean;
  showIcon: boolean;
}

// Compact title bar — icon size intentionally modest (matches how Notion/Slack
// render header icons in-context, ~40-48px) rather than the oversized hero
// emoji some board tools use, since this also needs to look right when someone
// swaps the emoji for an uploaded company logo.
export default function CanvasTitleHeader({
  title,
  description,
  icon,
  showTitle,
  showDescription,
  showIcon,
}: CanvasTitleHeaderProps) {
  return (
    <div
      className="flex items-center gap-3 border-b border-gray-200 bg-white px-4"
      style={{ height: CANVAS_TITLE_HEADER_HEIGHT, flexShrink: 0 }}
    >
      {showIcon && icon ? (
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-50 text-2xl leading-none">
          {icon.startsWith('http') ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={icon} alt="" className="h-full w-full object-cover" />
          ) : (
            icon
          )}
        </div>
      ) : null}
      <div className="min-w-0 flex-1 leading-tight">
        {showTitle ? <h1 className="truncate text-lg font-semibold text-gray-900">{title}</h1> : null}
        {showDescription && description ? (
          <p className="truncate text-xs text-gray-500">{description}</p>
        ) : null}
      </div>
    </div>
  );
}
