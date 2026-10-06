import { describe, expect, it, vi } from 'vitest';
import {
  attemptTimelineAutoInitOnce,
  TIMELINE_AUTO_INIT_FAILURE_TOAST,
  type TimelineAutoInitInput,
} from './timelineAutoInit';

// PATCH-297 defect 1. Live, a failing first-entry create deleted its
// "attempted" marker and the effect retried on every render -- 1,672 creates
// in two minutes, each with an error toast. The helper owns the once-per-board
// decision so it is testable without mounting the 12k-line CanvasClient.
function host(overrides: Partial<TimelineAutoInitInput> = {}): TimelineAutoInitInput {
  return {
    isTimelineLayout: true,
    canvasId: 'board-1',
    loading: false,
    canEdit: true,
    rootContainerCount: 0,
    attempted: new Set<string>(),
    createEmptyContainer: vi.fn(async () => true),
    onFailure: vi.fn(),
    ...overrides,
  };
}

describe('attemptTimelineAutoInitOnce (PATCH-297 defect 1)', () => {
  it('creates exactly once for an empty timeline board', async () => {
    const input = host();
    await expect(attemptTimelineAutoInitOnce(input)).resolves.toBe('created');
    expect(input.createEmptyContainer).toHaveBeenCalledTimes(1);
    expect(input.onFailure).not.toHaveBeenCalled();
  });

  it('does not retry after a failed create on the next render', async () => {
    const attempted = new Set<string>();
    const createEmptyContainer = vi.fn(async () => false);
    const onFailure = vi.fn();
    const input = host({ attempted, createEmptyContainer, onFailure });

    await expect(attemptTimelineAutoInitOnce(input)).resolves.toBe('failed');
    await expect(attemptTimelineAutoInitOnce(input)).resolves.toBe('skipped');

    expect(createEmptyContainer).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it('shows exactly one failure toast across repeated failed renders', async () => {
    const input = host({ createEmptyContainer: vi.fn(async () => false) });
    await attemptTimelineAutoInitOnce(input);
    await attemptTimelineAutoInitOnce(input);
    await attemptTimelineAutoInitOnce(input);
    expect(input.onFailure).toHaveBeenCalledTimes(1);
  });

  it('keeps the attempted marker after a failure', async () => {
    const attempted = new Set<string>();
    await attemptTimelineAutoInitOnce(
      host({ attempted, createEmptyContainer: async () => false }),
    );
    expect(attempted.has('board-1')).toBe(true);
  });

  it('marks a non-empty board as attempted without creating', async () => {
    const input = host({ rootContainerCount: 1 });
    await expect(attemptTimelineAutoInitOnce(input)).resolves.toBe('skipped');
    expect(input.createEmptyContainer).not.toHaveBeenCalled();
    expect(input.attempted.has('board-1')).toBe(true);
  });

  it('skips when not a timeline, without a board, while loading or read-only', async () => {
    for (const overrides of [
      { isTimelineLayout: false },
      { canvasId: null },
      { loading: true },
      { canEdit: false },
    ] as Array<Partial<TimelineAutoInitInput>>) {
      const input = host(overrides);
      await expect(attemptTimelineAutoInitOnce(input)).resolves.toBe('skipped');
      expect(input.createEmptyContainer, JSON.stringify(overrides)).not.toHaveBeenCalled();
    }
  });

  it('exposes the exact failure toast copy from the design', () => {
    expect(TIMELINE_AUTO_INIT_FAILURE_TOAST).toBe(
      'Could not create the first timeline entry. Use + to add one.',
    );
  });

  it('skips without marking while a template request is active, then runs normally after', async () => {
    const attempted = new Set<string>();
    const createEmptyContainer = vi.fn(async () => true);

    const active = host({ attempted, createEmptyContainer, templateRequestActive: true });
    await expect(attemptTimelineAutoInitOnce(active)).resolves.toBe('skipped');
    expect(createEmptyContainer).not.toHaveBeenCalled();
    expect(attempted.has('board-1')).toBe(false);

    // The request has cleared and the template's posts are now present: the
    // normal rule runs and marks the board attempted.
    const after = host({ attempted, createEmptyContainer, rootContainerCount: 1 });
    await expect(attemptTimelineAutoInitOnce(after)).resolves.toBe('skipped');
    expect(createEmptyContainer).not.toHaveBeenCalled();
    expect(attempted.has('board-1')).toBe(true);
  });

  it('does not mark the board attempted while a request is active on an empty board', async () => {
    const attempted = new Set<string>();
    const input = host({ attempted, templateRequestActive: true, rootContainerCount: 0 });
    await expect(attemptTimelineAutoInitOnce(input)).resolves.toBe('skipped');
    expect(attempted.size).toBe(0);
    expect(input.createEmptyContainer).not.toHaveBeenCalled();
  });
});
