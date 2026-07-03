'use client';

import React, { useState } from 'react';
import { Pencil, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Returns a contrasting icon color (#1e293b dark or #f8fafc light) for a given hex bg. */
export function contrastIconColor(hex: string): string {
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  if (full.length !== 6) return '#1e293b';
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return lum > 0.35 ? '#1e293b' : '#f8fafc';
}

export interface CardShellProps {
  // Identity
  padletId: string;
  testId?: string;

  // Visual
  topStripColor?: string | null;    // metadata.topStrip or null
  cardColor?: string;               // metadata.cardColor or '#ffffff'
  isContainer: boolean;             // controls strip height and content padding
  className?: string;               // escape hatch for layout-specific needs

  // Container title rendered inside the strip (replaces RowColumnContainerCard header)
  title?: string;

  // Edit button (permission-gated by parent)
  onEdit?: () => void;              // if provided -> pencil shows; if undefined -> hidden

  // Container expand/collapse (no permission gating)
  onExpandToggle?: () => void;      // container only: if provided -> expand button shows
  isExpanded?: boolean;             // container only: current expand state

  // Events (shell emits, parent handles)
  onContextMenu?: (e: React.MouseEvent) => void;

  // Content
  children: React.ReactNode;
}

export default function CardShell({
  padletId,
  testId,
  topStripColor,
  cardColor,
  isContainer,
  title,
  className,
  onEdit,
  onExpandToggle,
  isExpanded,
  onContextMenu,
  children,
}: CardShellProps) {
  const [hovered, setHovered] = useState(false);
  const hasColoredStrip = Boolean(topStripColor);
  // Strip height is a minimum — when title wraps it grows naturally via flexbox.
  // Post strip: 22px fits the 20px button. Container strip: 28px.
  const stripMinHeight = isContainer ? '28px' : '22px';
  const stripBg = hasColoredStrip ? topStripColor! : 'rgba(0,0,0,0.04)';
  // Contrast-safe colors for anything rendered on the strip.
  const contrastColor = hasColoredStrip && topStripColor ? contrastIconColor(topStripColor) : null;
  const iconColor  = contrastColor ?? '#9ca3af'; // gray-400 on the default strip
  const titleColor = contrastColor ?? '#374151'; // gray-700 — more prominent than icon

  return (
    <div
      data-padlet-id={padletId}
      data-testid={testId}
      className={cn(
        'bg-white border border-gray-200 overflow-hidden flex flex-col',
        className
      )}
      style={{ backgroundColor: cardColor || '#ffffff' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={onContextMenu}
    >
      {/* Top strip — 3-column grid: [expand | centered title | pencil]
          Expand (permanent) on left, pencil (hover-only) on right.
          Each side renders an invisible placeholder when its real button is absent
          so the title stays truly centered in all combinations. */}
      <div
        className="w-full flex-shrink-0 grid"
        style={{ gridTemplateColumns: 'auto 1fr auto', minHeight: stripMinHeight, backgroundColor: stripBg }}
      >
        {/* Left: expand always-visible, or placeholder when absent */}
        <div className="flex items-center pl-1.5">
          {onExpandToggle ? (
            <button
              type="button"
              data-no-drag="true"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onExpandToggle(); }}
              className="shrink-0 w-5 h-5 rounded flex items-center justify-center hover:bg-black/10 transition-colors"
              style={{ color: iconColor }}
              title={isExpanded ? 'Collapse' : 'Expand'}
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          ) : onEdit ? (
            <div className="w-5 h-5 shrink-0" aria-hidden="true" />
          ) : null}
        </div>

        {/* Center: title, wraps freely and grows the strip */}
        <div className="flex items-center justify-center px-1 min-w-0">
          {title && (
            <span
              className="text-xs font-semibold text-center break-words leading-snug py-1"
              style={{ color: titleColor }}
            >
              {title}
            </span>
          )}
        </div>

        {/* Right: pencil hover-only, or placeholder when absent */}
        <div className="flex items-center pr-1.5">
          {onEdit ? (
            <button
              type="button"
              data-no-drag="true"
              data-post-menu-trigger="true"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="shrink-0 w-5 h-5 rounded flex items-center justify-center hover:bg-black/10 transition-opacity"
              style={{ color: iconColor, opacity: hovered ? 1 : 0 }}
              title="Edit"
            >
              <Pencil className="w-3 h-3" />
            </button>
          ) : onExpandToggle ? (
            <div className="w-5 h-5 shrink-0" aria-hidden="true" />
          ) : null}
        </div>
      </div>

      {/* Content area */}
      <div className={isContainer ? 'overflow-hidden p-2' : 'flex-1 overflow-hidden p-3'}>
        {children}
      </div>
    </div>
  );
}
