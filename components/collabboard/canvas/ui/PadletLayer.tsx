"use client";

import type React from 'react';

interface PadletLayerProps {
  className: string;
  style: React.CSSProperties;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void | Promise<void>;
  onMouseDown?: (e: React.MouseEvent<HTMLDivElement>) => void;
  children: React.ReactNode;
}

export default function PadletLayer({ className, style, onDragOver, onDrop, onMouseDown, children }: PadletLayerProps) {
  return (
    <div className={className} style={style} onDragOver={onDragOver} onDrop={onDrop} onMouseDown={onMouseDown}>
      {children}
    </div>
  );
}
