'use client';

/**
 * PATCH-374. The host's facilitator panel: start a shared countdown, or bring
 * everyone to what the host is looking at.
 *
 * It hangs off a toolbar tool (`facilitate`, next to Board AI). The registry
 * withholds that tool from anyone who is not a host and from guests; the
 * `canControl` prop is the SECOND gate, so a caller that mounts this anyway
 * still cannot offer a control the board's RPCs would refuse.
 *
 * "Bring everyone here" is disabled on Map: a Map post is a place on the globe,
 * not a spot in a viewport, so there is nothing to bring everyone to. The title
 * says so rather than leaving a dead button unexplained.
 */

import React, { useState } from 'react';
import { Users, X } from 'lucide-react';

import { TIMER_PRESETS, formatTimer, timerSecondsError } from '@/lib/domain/facilitation/boardTimer';

export interface FacilitatorMenuProps {
  readonly open: boolean;
  /** Hosts only (board owner or board admin). */
  readonly canControl: boolean;
  readonly isMapLayout: boolean;
  readonly onStart: (seconds: number) => void;
  readonly onSummon: () => void;
  readonly onClose: () => void;
}

export default function FacilitatorMenu({
  open,
  canControl,
  isMapLayout,
  onStart,
  onSummon,
  onClose,
}: FacilitatorMenuProps) {
  const [customMinutes, setCustomMinutes] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);

  if (!open || !canControl) return null;

  const startPreset = (seconds: number) => {
    onStart(seconds);
    onClose();
  };

  const startCustom = () => {
    const minutes = Number(customMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      setCustomError('Enter a number of minutes');
      return;
    }
    const seconds = Math.round(minutes * 60);
    const error = timerSecondsError(seconds);
    if (error) {
      setCustomError(error);
      return;
    }
    setCustomError(null);
    onStart(seconds);
    onClose();
  };

  return (
    <div
      data-facilitator-menu="true"
      /*
        PATCH-374 Addendum 1. It used to sit at the BOTTOM left, on top of the
        Freeform navigation/minimap control (`[data-freeform-navigation-control]`
        is `absolute bottom-4 left-[72px] z-40`) -- a real click on "Bring
        everyone here" landed on the minimap instead. Two things were wrong: the
        overlap, and the fact that this panel's z-index was TRAPPED inside
        CanvasViewport's `isolation: 'isolate'` so it could never out-rank that
        z-40 sibling. CanvasClient now renders this panel as a sibling of
        CanvasViewport (as LibraryPanel is), and here it is anchored BELOW the
        title header and clear of the left toolbar, where no layout puts a
        control. z-[1960] is above the minimap's z-40 in the root context.
      */
      className="fixed left-16 top-16 z-[1960] w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Facilitate</p>
        <button
          type="button"
          data-facilitate-close="true"
          onClick={onClose}
          aria-label="Close the facilitator menu"
          className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <X size={14} />
        </button>
      </div>

      <p className="mb-1 text-[11px] font-medium text-slate-600">Timer</p>
      <div className="mb-2 grid grid-cols-4 gap-1">
        {TIMER_PRESETS.map((seconds) => (
          <button
            key={seconds}
            type="button"
            data-facilitate-timer-preset={seconds}
            onClick={() => startPreset(seconds)}
            className="rounded border border-slate-200 px-1 py-1 text-[11px] text-slate-700 hover:bg-slate-50"
          >
            {formatTimer(seconds)}
          </button>
        ))}
      </div>

      <div className="mb-3 flex items-center gap-1">
        <input
          type="number"
          min={1}
          data-facilitate-timer-custom="true"
          value={customMinutes}
          onChange={(event) => { setCustomMinutes(event.target.value); setCustomError(null); }}
          placeholder="min"
          aria-label="Custom minutes"
          className="w-16 rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-700"
        />
        <button
          type="button"
          data-facilitate-timer-start="true"
          onClick={startCustom}
          className="rounded bg-slate-800 px-2 py-1 text-[11px] font-medium text-white hover:bg-slate-700"
        >
          Start
        </button>
        {customError ? (
          <span data-facilitate-timer-error="true" className="text-[10px] text-red-600">{customError}</span>
        ) : null}
      </div>

      <button
        type="button"
        data-facilitate-summon="true"
        onClick={() => { onSummon(); onClose(); }}
        disabled={isMapLayout}
        title={isMapLayout ? 'Not available on Map boards' : 'Bring everyone to your view'}
        className="flex w-full items-center gap-2 rounded border border-slate-200 px-2 py-1.5 text-left text-[11px] text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
      >
        <Users size={14} />
        Bring everyone here
      </button>
    </div>
  );
}
