"use client";

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

/**
 * PATCH-381. A one-time tip on a viewer's first visit to a Padlet-layout board
 * (Wall / Columns / Grid / Timeline): "Click a post to edit it. Click the
 * background to save." Closing it is remembered per viewer in localStorage.
 *
 * Storage can be unavailable (private mode, blocked cookies). The try/catch
 * means the bar simply shows again next visit -- an acceptable, non-blocking
 * outcome, never an exception.
 */
interface FirstTipBarProps {
  /** Per-viewer localStorage key. Defaults to one shared Padlet-layout key. */
  storageKey?: string;
  message?: string;
  /**
   * PATCH-381b. Reports whether the tip is currently shown, so a host can hide
   * another bottom bar it would otherwise sit on top of (Columns' onboarding
   * hint). Called on mount and on every show/hide.
   */
  onVisibilityChange?: (visible: boolean) => void;
}

export const FIRST_TIP_DEFAULT_KEY = 'fable5:padlet-layout-first-tip';
export const FIRST_TIP_DEFAULT_MESSAGE =
  'Click a post to edit it. Click the background to save.';

export default function FirstTipBar({
  storageKey = FIRST_TIP_DEFAULT_KEY,
  message = FIRST_TIP_DEFAULT_MESSAGE,
  onVisibilityChange,
}: FirstTipBarProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let seen = false;
    try {
      seen = window.localStorage.getItem(storageKey) === '1';
    } catch {
      seen = false;
    }
    setVisible(!seen);
    onVisibilityChange?.(!seen);
  }, [storageKey, onVisibilityChange]);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    onVisibilityChange?.(false);
    try {
      window.localStorage.setItem(storageKey, '1');
    } catch {
      // Storage unavailable: the tip shows again next visit. Acceptable.
    }
  };

  return (
    <div
      data-first-tip
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[1500] flex items-center gap-3 rounded-full bg-black/80 px-4 py-2 text-sm text-white shadow-lg"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Close tip"
        className="rounded-full p-0.5 hover:bg-white/20 transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
