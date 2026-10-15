// @vitest-environment jsdom
//
// PATCH-374 -- the shared timer pill. Every phase, the host-only controls, the
// chime, and the per-viewer mute (including a localStorage that throws).
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BoardTimerPill from './BoardTimerPill';
import type { TimerState } from '@/lib/domain/facilitation/boardTimer';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const running = (remainingSeconds: number, durationSeconds = 300): TimerState =>
  ({ phase: 'running', remainingSeconds, durationSeconds });
const paused = (remainingSeconds: number): TimerState =>
  ({ phase: 'paused', remainingSeconds, durationSeconds: 300 });

/** A WebAudio stand-in that records what was asked of it. */
const audio = { oscillators: 0, starts: 0, stops: 0, closed: 0 };

function installAudio() {
  class FakeOscillator {
    type = '';
    frequency = { value: 0 };
    onended: (() => void) | null = null;
    connect() { return { connect: () => undefined }; }
    start() { audio.starts += 1; }
    stop() { audio.stops += 1; this.onended?.(); }
  }
  class FakeAudioContext {
    currentTime = 0;
    destination = {};
    createOscillator() { audio.oscillators += 1; return new FakeOscillator(); }
    createGain() { return { gain: { value: 0 }, connect: () => ({ connect: () => undefined }) }; }
    close() { audio.closed += 1; return Promise.resolve(); }
  }
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
}

let mounted: ReturnType<typeof render> | null = null;
const handlers = {
  onPause: vi.fn(),
  onResume: vi.fn(),
  onAdd: vi.fn(),
  onStop: vi.fn(),
};

function renderPill(timer: TimerState, canControl = false) {
  mounted = render(
    <BoardTimerPill
      timer={timer}
      canControl={canControl}
      onPause={handlers.onPause}
      onResume={handlers.onResume}
      onAdd={handlers.onAdd}
      onStop={handlers.onStop}
    />,
  );
}

const pill = () => document.querySelector('[data-board-timer="true"]') as HTMLElement | null;
const action = (name: string) => document.querySelector(`[data-board-timer-action="${name}"]`) as HTMLElement | null;

beforeEach(() => {
  audio.oscillators = 0;
  audio.starts = 0;
  audio.stops = 0;
  audio.closed = 0;
  installAudio();
  window.localStorage.clear();
  Object.values(handlers).forEach((fn) => fn.mockReset());
});

afterEach(() => {
  if (mounted) act(() => { mounted!.unmount(); });
  cleanup();
  mounted = null;
  vi.restoreAllMocks();
});

describe('A. phases', () => {
  it('renders nothing while the timer is idle', () => {
    renderPill({ phase: 'idle', remainingSeconds: 0, durationSeconds: null });
    expect(pill()).toBeNull();
  });

  it('shows m:ss while running, with the phase and the seconds on the element', () => {
    renderPill(running(300));
    expect(pill()?.dataset.boardTimerPhase).toBe('running');
    expect(pill()?.dataset.boardTimerRemaining).toBe('300');
    expect(screen.getByText('5:00')).toBeTruthy();
  });

  it('shows "Paused m:ss" while paused', () => {
    renderPill(paused(42));
    expect(pill()?.dataset.boardTimerPhase).toBe('paused');
    expect(screen.getByText('Paused 0:42')).toBeTruthy();
  });

  it('shows "Time\'s up" when finished', () => {
    renderPill({ phase: 'finished', remainingSeconds: 0, durationSeconds: 300 });
    expect(pill()?.dataset.boardTimerPhase).toBe('finished');
    expect(screen.getByText("Time's up")).toBeTruthy();
  });

  it('pulses only in the last ten seconds', () => {
    renderPill(running(11));
    expect(screen.getByText('0:11').className).not.toContain('animate-pulse');

    if (mounted) act(() => { mounted!.unmount(); });
    cleanup();
    renderPill(running(10));
    expect(screen.getByText('0:10').className).toContain('animate-pulse');
  });
});

describe('B. the chime', () => {
  it('chimes once when a countdown ends', () => {
    renderPill({ phase: 'finished', remainingSeconds: 0, durationSeconds: 300 });
    expect(audio.oscillators).toBe(1);

    // A re-render while still finished does not chime again.
    if (mounted) act(() => { mounted!.rerender(
      <BoardTimerPill timer={{ phase: 'finished', remainingSeconds: 0, durationSeconds: 300 }} canControl={false} {...handlers} />,
    ); });
    expect(audio.oscillators).toBe(1);
  });

  it('does not chime when the viewer muted it', () => {
    window.localStorage.setItem('board-timer-muted', 'true');
    renderPill({ phase: 'finished', remainingSeconds: 0, durationSeconds: 300 });
    expect(audio.oscillators).toBe(0);
  });
});

describe('C. the mute toggle', () => {
  it('toggles and remembers the choice', () => {
    renderPill(running(120));
    const toggle = document.querySelector('[data-board-timer-mute="true"]') as HTMLElement;
    expect(window.localStorage.getItem('board-timer-muted')).toBeNull();

    act(() => { fireEvent.click(toggle); });
    expect(window.localStorage.getItem('board-timer-muted')).toBe('true');

    act(() => { fireEvent.click(toggle); });
    expect(window.localStorage.getItem('board-timer-muted')).toBe('false');
  });

  it('survives a localStorage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });

    renderPill(running(120));
    const toggle = document.querySelector('[data-board-timer-mute="true"]') as HTMLElement;
    expect(toggle).toBeTruthy();
    act(() => { fireEvent.click(toggle); });
    expect(toggle).toBeTruthy();
  });
});

describe('D. host controls', () => {
  it('are absent for everyone else', () => {
    renderPill(running(300), false);
    expect(action('pause')).toBeNull();
    expect(action('add')).toBeNull();
    expect(action('stop')).toBeNull();
  });

  it('offer pause while running and resume while paused', () => {
    renderPill(running(300), true);
    expect(action('pause')).toBeTruthy();
    expect(action('resume')).toBeNull();
    act(() => { fireEvent.click(action('pause')!); });
    expect(handlers.onPause).toHaveBeenCalledTimes(1);

    if (mounted) act(() => { mounted!.unmount(); });
    cleanup();
    renderPill(paused(120), true);
    expect(action('resume')).toBeTruthy();
    expect(action('pause')).toBeNull();
    act(() => { fireEvent.click(action('resume')!); });
    expect(handlers.onResume).toHaveBeenCalledTimes(1);
  });

  it('adds exactly one minute and stops', () => {
    renderPill(running(300), true);
    act(() => { fireEvent.click(action('add')!); });
    expect(handlers.onAdd).toHaveBeenCalledWith(60);
    act(() => { fireEvent.click(action('stop')!); });
    expect(handlers.onStop).toHaveBeenCalledTimes(1);
  });

  it('are hidden once the countdown has finished', () => {
    renderPill({ phase: 'finished', remainingSeconds: 0, durationSeconds: 300 }, true);
    expect(action('add')).toBeNull();
    expect(action('stop')).toBeNull();
  });
});
