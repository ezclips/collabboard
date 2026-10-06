'use client';

/**
 * PATCH-291. The drawing post's own library button, sitting next to Excalidraw's
 * stock toolbar like the Drawing canvas's cluster. It uses literal colours
 * (Excalidraw redefines Tailwind's palette variables inside its container, which
 * turned the old hover black), toggles the DEFAULT sidebar, and follows
 * `appState.openSidebar` so its active state stays in sync with the sidebar.
 */

import React from 'react';
import { Library } from 'lucide-react';

const TOOLBAR_SELECTOR = '.Island.App-toolbar';
const OFFSET_PX = 12;
const RETRY_MS = 120;
const MAX_RETRIES = 25;
const DEFAULT_SIDEBAR_NAME = 'default';
const LIBRARY_SIDEBAR_TAB = 'library';

export interface LibraryToolbarButtonApi {
  getAppState: () => { openSidebar?: { name?: string | null } | null } | null | undefined;
  onChange: (callback: () => void) => () => void;
  toggleSidebar: (options: { name: string; tab?: string }) => void;
}

export interface LibraryToolbarButtonProps {
  getApi: () => LibraryToolbarButtonApi | null;
  rootRef: React.RefObject<HTMLElement | null>;
  apiVersion?: number;
  readOnly?: boolean;
}

export default function LibraryToolbarButton({
  getApi,
  rootRef,
  apiVersion = 0,
  readOnly = false,
}: LibraryToolbarButtonProps): React.ReactElement | null {
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState<{ top: number; left: number } | null>(null);

  React.useEffect(() => {
    const api = getApi();
    if (!api || typeof api.onChange !== 'function') {
      setOpen(false);
      return;
    }
    const update = () => setOpen(api.getAppState?.()?.openSidebar?.name === DEFAULT_SIDEBAR_NAME);
    update();
    return api.onChange(update);
  }, [getApi, apiVersion]);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let disposed = false;
    let frame = 0;
    let timeout: number | null = null;
    let retries = 0;

    const measure = () => {
      if (disposed) return;
      frame = 0;
      const toolbar = root.querySelector<HTMLElement>(TOOLBAR_SELECTOR);
      const toolbarRect = toolbar?.getBoundingClientRect();
      if (!toolbar || !toolbarRect || toolbarRect.width === 0 || toolbarRect.height === 0) {
        if (retries < MAX_RETRIES) {
          retries += 1;
          timeout = window.setTimeout(measure, RETRY_MS);
        }
        return;
      }
      retries = 0;
      const rootRect = root.getBoundingClientRect();
      setPosition({
        left: toolbarRect.right - rootRect.left + OFFSET_PX,
        top: toolbarRect.top - rootRect.top + toolbarRect.height / 2,
      });
    };

    const schedule = () => {
      if (disposed) return;
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };

    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    observer?.observe(root);
    const toolbar = root.querySelector<HTMLElement>(TOOLBAR_SELECTOR);
    if (toolbar) observer?.observe(toolbar);

    measure();
    window.addEventListener('resize', schedule);

    return () => {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      if (timeout) window.clearTimeout(timeout);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [rootRef]);

  if (readOnly) return null;

  return (
    <div
      className="absolute z-[130] bg-white rounded-lg shadow-lg border border-[#e5e7eb] p-1 pointer-events-auto"
      style={{
        top: position ? `${position.top}px` : undefined,
        left: position ? `${position.left}px` : undefined,
        transform: 'translateY(-50%)',
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      <button
        type="button"
        data-drawing-library-button
        aria-label="Open library"
        title="Open library"
        aria-pressed={open}
        onClick={() => getApi()?.toggleSidebar({ name: DEFAULT_SIDEBAR_NAME, tab: LIBRARY_SIDEBAR_TAB })}
        className={`p-2 rounded-md transition-colors flex items-center gap-2 text-sm font-medium ${
          open ? 'bg-[#dbeafe] text-[#1d4ed8]' : 'text-[#374151] hover:bg-[#f1f0ff]'
        }`}
      >
        <Library size={18} />
      </button>
    </div>
  );
}
