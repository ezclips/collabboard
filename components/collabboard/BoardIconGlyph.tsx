'use client';

import React from 'react';
import { lineIconFor } from './boardIcons';

export interface BoardIconGlyphProps {
  icon: string | null | undefined;
  /** Applied to the line icon and to a text/emoji glyph. */
  className?: string;
  /** Applied to an image icon; defaults to `className`. */
  imageClassName?: string;
}

/**
 * PATCH-301. Renders a board's `thumbnail` string: `lucide:<name>` as a line
 * icon (an unknown name falls back to `layout`), an `http`/`data:` URL as an
 * image, anything else as text (an emoji).
 */
export default function BoardIconGlyph({
  icon,
  className,
  imageClassName,
}: BoardIconGlyphProps) {
  if (!icon) return null;

  if (icon.startsWith('lucide:')) {
    const Icon = lineIconFor(icon.slice('lucide:'.length));
    return <Icon data-icon-kind="line" className={className} aria-hidden="true" />;
  }

  if (icon.startsWith('http') || icon.startsWith('data:')) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={icon}
        alt=""
        data-icon-kind="image"
        className={imageClassName ?? className}
      />
    );
  }

  return (
    <span data-icon-kind="text" className={className}>
      {icon}
    </span>
  );
}
