'use client';

/**
 * PATCH-374. The shared countdown, for EVERYONE on the board (guests included).
 *
 * Hidden while the timer is idle, so nothing is on screen until a host starts
 * one. The remaining time comes from `timerState`, which reads the SERVER clock,
 * so every tab shows the same value.
 *
 * "Time's up" is local and short: the row is not cleared when a countdown ends,
 * so this shows it for the ten seconds `timerState` reports `finished` and then
 * the pill disappears on its own. The chime is a WebAudio beep (no asset) and is
 * skipped when the viewer muted it; the mute is per viewer, in localStorage, and
 * every access is wrapped -- a browser that refuses storage must not take the
 * pill down with it.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Bell, BellOff, Pause, Play, Plus, Square } from 'lucide-react';

import { TIMER_URGENT_SECONDS, formatTimer, type TimerState } from '@/lib/domain/facilitation/boardTimer';

const MUTE_KEY = 'board-timer-muted';

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeMuted(next: boolean): void {
  try {
    window.localStorage.setItem(MUTE_KEY, next ? 'true' : 'false');
  } catch {
    // A browser that refuses storage still gets a working toggle this visit.
  }
}

/** One short beep, synthesised. Silent on any browser that refuses audio. */
function playChime(): void {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const context = new Ctor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.value = 0.08;
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.25);
    oscillator.onended = () => { void context.close(); };
  } catch {
    // No chime is not a failure worth reporting.
  }
}

export interface BoardTimerPillProps {
  readonly timer: TimerState;
  /** Hosts get pause/resume, +1 min and stop. Everyone else just watches. */
  readonly canControl?: boolean;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onAdd: (seconds: number) => void;
  readonly onStop: () => void;
}

export default function BoardTimerPill({
  timer,
  canControl = false,
  onPause,
  onResume,
  onAdd,
  onStop,
}: BoardTimerPillProps) {
  const [muted, setMuted] = useState(false);
  // Read through a ref as well: the chime effect must see the STORED choice on
  // the very first commit, before the state update from this read has landed.
  const mutedRef = useRef(false);

  useEffect(() => {
    const stored = readMuted();
    mutedRef.current = stored;
    setMuted(stored);
  }, []);

  // Chime once per countdown that ends, not once per tick of "Time's up".
  const chimedRef = useRef(false);
  useEffect(() => {
    if (timer.phase !== 'finished') {
      chimedRef.current = false;
      return;
    }
    if (chimedRef.current) return;
    chimedRef.current = true;
    if (!mutedRef.current) playChime();
  }, [timer.phase]);

  if (timer.phase === 'idle') return null;

  const urgent = timer.phase === 'running' && timer.remainingSeconds <= TIMER_URGENT_SECONDS;
  const label = timer.phase === 'finished'
    ? "Time's up"
    : timer.phase === 'paused'
      ? `Paused ${formatTimer(timer.remainingSeconds)}`
      : formatTimer(timer.remainingSeconds);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    mutedRef.current = next;
    writeMuted(next);
  };

  return (
    <div
      data-board-timer="true"
      data-board-timer-phase={timer.phase}
      data-board-timer-remaining={timer.remainingSeconds}
      className={`fixed left-1/2 top-4 z-[1950] flex -translate-x-1/2 items-center gap-2 rounded-full border px-3 py-1 shadow-md ${
        urgent || timer.phase === 'finished'
          ? 'border-red-300 bg-red-50 text-red-900'
          : 'border-slate-300 bg-white/95 text-slate-900'
      }`}
    >
      <span
        data-board-timer-label="true"
        className={`text-sm font-semibold tabular-nums ${urgent ? 'animate-pulse' : ''}`}
      >
        {label}
      </span>

      <button
        type="button"
        data-board-timer-mute="true"
        onClick={toggleMute}
        aria-label={muted ? 'Unmute the timer chime' : 'Mute the timer chime'}
        title={muted ? 'Unmute the timer chime' : 'Mute the timer chime'}
        className="rounded-full p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
      >
        {muted ? <BellOff size={14} /> : <Bell size={14} />}
      </button>

      {canControl && timer.phase !== 'finished' ? (
        <span className="flex items-center gap-1 border-l border-slate-200 pl-2">
          {timer.phase === 'running' ? (
            <button
              type="button"
              data-board-timer-action="pause"
              onClick={onPause}
              aria-label="Pause the timer"
              title="Pause"
              className="rounded-full p-1 text-slate-600 hover:bg-slate-100"
            >
              <Pause size={14} />
            </button>
          ) : (
            <button
              type="button"
              data-board-timer-action="resume"
              onClick={onResume}
              aria-label="Resume the timer"
              title="Resume"
              className="rounded-full p-1 text-slate-600 hover:bg-slate-100"
            >
              <Play size={14} />
            </button>
          )}
          <button
            type="button"
            data-board-timer-action="add"
            onClick={() => onAdd(60)}
            aria-label="Add one minute"
            title="Add 1 minute"
            className="rounded-full p-1 text-slate-600 hover:bg-slate-100"
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            data-board-timer-action="stop"
            onClick={onStop}
            aria-label="Stop the timer"
            title="Stop"
            className="rounded-full p-1 text-slate-600 hover:bg-slate-100"
          >
            <Square size={14} />
          </button>
        </span>
      ) : null}
    </div>
  );
}
