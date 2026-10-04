'use client';

import React from 'react';
import { X } from 'lucide-react';

/**
 * PATCH-275. The docked side-panel column, shared by the generator's design
 * panels and the element panel. `DockedPanelShell` is the one 44 px header +
 * body shell (extracted from `OutlineSuggestionsPanel`); `PictureSidePanelContext`
 * lets the element editor portal its panel into the same host.
 */

export interface PictureSidePanelContextValue {
  /** The column to portal the element panel into; null when there is none. */
  host: HTMLElement | null;
  /** True while an element's own panel owns the column. */
  elementPanelOpen: boolean;
  setElementPanelOpen: (open: boolean) => void;
}

export const PictureSidePanelContext = React.createContext<PictureSidePanelContextValue | null>(null);

/** The context when a provider exists, else `null` (nothing is rendered). */
export function usePictureSidePanel(): PictureSidePanelContextValue | null {
  return React.useContext(PictureSidePanelContext);
}

export interface DockedPanelShellProps {
  /** The `data-ai-side-panel` id, e.g. `designs` or `element`. */
  id: string;
  icon: React.ReactNode;
  title: string;
  /** Extra header content, e.g. the family filter chip. */
  headerExtra?: React.ReactNode;
  onClose: () => void;
  /** Extra section classes (host/standalone layout). */
  className?: string;
  children: React.ReactNode;
}

/**
 * PATCH-275. The one docked panel shell: a header with icon, title, extra
 * content and a close button, then the scrolling body the caller provides.
 * Markup and attributes are identical to the pre-extraction panel.
 */
export function DockedPanelShell({ id, icon, title, headerExtra, onClose, className = '', children }: DockedPanelShellProps) {
  return (
    <section data-ai-side-panel={id} className={`flex w-full flex-col bg-white ${className}`}>
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-gray-200 px-3">
        <span className="text-gray-500">{icon}</span>
        <span className="text-sm font-semibold text-gray-700">{title}</span>
        {headerExtra}
        <button
          type="button"
          data-ai-side-panel-close="true"
          aria-label="Close panel"
          title="Close panel"
          onClick={onClose}
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      {children}
    </section>
  );
}
