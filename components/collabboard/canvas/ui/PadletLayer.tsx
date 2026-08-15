"use client";

import type React from 'react';

interface PadletLayerProps {
  className: string;
  style: React.CSSProperties;
  'data-freeform-world-surface'?: 'true';
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void | Promise<void>;
  onMouseDown?: (e: React.MouseEvent<HTMLDivElement>) => void;
  children: React.ReactNode;
}

export default function PadletLayer({ className, style, onDragOver, onDrop, onMouseDown, children, 'data-freeform-world-surface': freeformWorldSurface }: PadletLayerProps) {
  return (
    <div
      className={className}
      style={style}
      data-freeform-world-surface={freeformWorldSurface}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onMouseDown={onMouseDown}
    >
      {children}
    </div>
  );
}
