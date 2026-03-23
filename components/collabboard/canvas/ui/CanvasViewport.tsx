"use client";

import type React from 'react';

interface CanvasViewportProps {
  className: string;
  style: React.CSSProperties;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onWheel: (e: React.WheelEvent<HTMLDivElement>) => void;
  onMouseDown?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void | Promise<void>;
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseMove: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseUp: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => void;
  children: React.ReactNode;
}

export default function CanvasViewport({
  className,
  style,
  containerRef,
  onWheel,
  onMouseDown,
  onDragOver,
  onDrop,
  onClick,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
  children,
}: CanvasViewportProps) {
  return (
    <div
      className={className}
      style={style}
      ref={containerRef}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onClick}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>
  );
}
