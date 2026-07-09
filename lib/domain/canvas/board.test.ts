import { describe, expect, it } from 'vitest';
import {
  createSetBoardBackgroundCommand,
  createSetBoardCoverCommand,
  createSetChronoModeCommand,
  createSetMapStyleCommand,
} from './board';
import type { BoardBackgroundFields, BoardCoverFields, CanvasBoardRepository } from './board';
import type { DomainError } from '../core/errors';
import { domainError } from '../core/errors';
import type { Result } from '../core/result';
import { err, ok } from '../core/result';

const ctx = { userId: null };

function createFakeRepository() {
  const settingsCalls: Array<{ id: string; settings: Record<string, unknown> }> = [];
  const stampedCalls: Array<{
    id: string;
    settings: Record<string, unknown>;
    updatedAt: string;
  }> = [];
  const backgroundCalls: Array<{ id: string; fields: BoardBackgroundFields }> = [];
  const coverCalls: Array<{ id: string; fields: BoardCoverFields }> = [];

  let settingsResult: Result<void, DomainError> = ok(undefined);
  let stampedResult: Result<void, DomainError> = ok(undefined);
  let backgroundResult: Result<void, DomainError> = ok(undefined);
  let coverResult: Result<void, DomainError> = ok(undefined);

  const repository: CanvasBoardRepository = {
    updateSettings: async (id, fields) => {
      settingsCalls.push({ id, settings: fields.settings });
      return settingsResult;
    },
    updateSettingsStamped: async (id, fields) => {
      stampedCalls.push({ id, settings: fields.settings, updatedAt: fields.updatedAt });
      return stampedResult;
    },
    updateBackground: async (id, fields) => {
      backgroundCalls.push({ id, fields });
      return backgroundResult;
    },
    updateCover: async (id, fields) => {
      coverCalls.push({ id, fields });
      return coverResult;
    },
  };

  return {
    repository,
    settingsCalls,
    stampedCalls,
    backgroundCalls,
    coverCalls,
    setSettingsResult(result: Result<void, DomainError>) {
      settingsResult = result;
    },
    setStampedResult(result: Result<void, DomainError>) {
      stampedResult = result;
    },
    setBackgroundResult(result: Result<void, DomainError>) {
      backgroundResult = result;
    },
    setCoverResult(result: Result<void, DomainError>) {
      coverResult = result;
    },
  };
}

describe('canvas.setMapStyle', () => {
  it('merges the style into current settings preserving other keys and writes WITHOUT a timestamp', async () => {
    const fake = createFakeRepository();
    const setMapStyle = createSetMapStyleCommand(fake.repository);

    const result = await setMapStyle(
      {
        boardId: 'board-1',
        styleId: 'mapbox://styles/mapbox/dark-v11',
        currentSettings: { chronoMode: 'week', mapStyleId: 'mapbox://styles/mapbox/streets-v11' },
      },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(fake.settingsCalls).toEqual([
      {
        id: 'board-1',
        settings: { chronoMode: 'week', mapStyleId: 'mapbox://styles/mapbox/dark-v11' },
      },
    ]);
    expect(fake.stampedCalls).toHaveLength(0);
  });

  it('propagates a repository failure unchanged', async () => {
    const fake = createFakeRepository();
    fake.setSettingsResult(err(domainError('unavailable', 'db down')));
    const setMapStyle = createSetMapStyleCommand(fake.repository);

    const result = await setMapStyle(
      { boardId: 'board-1', styleId: 'style-x', currentSettings: {} },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
    }
  });
});

describe('canvas.setBoardBackground', () => {
  it('sends the background type and value with an ISO timestamp to the right board', async () => {
    const fake = createFakeRepository();
    const setBoardBackground = createSetBoardBackgroundCommand(fake.repository);

    const result = await setBoardBackground(
      { boardId: 'board-1', backgroundType: 'gradient', backgroundValue: 'linear-gradient(#fff, #000)' },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(fake.backgroundCalls).toHaveLength(1);
    expect(fake.backgroundCalls[0].id).toBe('board-1');
    expect(fake.backgroundCalls[0].fields.backgroundType).toBe('gradient');
    expect(fake.backgroundCalls[0].fields.backgroundValue).toBe('linear-gradient(#fff, #000)');
    expect(new Date(fake.backgroundCalls[0].fields.updatedAt).toISOString()).toBe(
      fake.backgroundCalls[0].fields.updatedAt,
    );
  });

  it('propagates a repository failure unchanged', async () => {
    const fake = createFakeRepository();
    fake.setBackgroundResult(err(domainError('unavailable', 'db down')));
    const setBoardBackground = createSetBoardBackgroundCommand(fake.repository);

    const result = await setBoardBackground(
      { boardId: 'board-1', backgroundType: 'color', backgroundValue: '#f3f4f6' },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
    }
  });
});

describe('canvas.setBoardCover', () => {
  it('sends the wholesale cover metadata with an ISO timestamp', async () => {
    const fake = createFakeRepository();
    const setBoardCover = createSetBoardCoverCommand(fake.repository);

    const result = await setBoardCover(
      { boardId: 'board-1', coverPostId: 'post-9', coverImage: 'https://x.test/cover.png' },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(fake.coverCalls).toHaveLength(1);
    expect(fake.coverCalls[0].id).toBe('board-1');
    expect(fake.coverCalls[0].fields.coverPostId).toBe('post-9');
    expect(fake.coverCalls[0].fields.coverImage).toBe('https://x.test/cover.png');
    expect(new Date(fake.coverCalls[0].fields.updatedAt).toISOString()).toBe(
      fake.coverCalls[0].fields.updatedAt,
    );
  });

  it('accepts a null cover image (legacy imageUrl || null path)', async () => {
    const fake = createFakeRepository();
    const setBoardCover = createSetBoardCoverCommand(fake.repository);

    const result = await setBoardCover(
      { boardId: 'board-1', coverPostId: 'post-9', coverImage: null },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(fake.coverCalls[0].fields.coverImage).toBeNull();
  });

  it('propagates a repository failure unchanged', async () => {
    const fake = createFakeRepository();
    fake.setCoverResult(err(domainError('unavailable', 'db down')));
    const setBoardCover = createSetBoardCoverCommand(fake.repository);

    const result = await setBoardCover(
      { boardId: 'board-1', coverPostId: 'post-9', coverImage: null },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
    }
  });
});

describe('canvas.setChronoMode', () => {
  it('merges the chrono mode into current settings with an ISO timestamp', async () => {
    const fake = createFakeRepository();
    const setChronoMode = createSetChronoModeCommand(fake.repository);

    const result = await setChronoMode(
      { boardId: 'board-1', mode: 'month', currentSettings: { mapStyleId: 'style-x' } },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(fake.stampedCalls).toHaveLength(1);
    expect(fake.stampedCalls[0].id).toBe('board-1');
    expect(fake.stampedCalls[0].settings).toEqual({ mapStyleId: 'style-x', chronoMode: 'month' });
    expect(new Date(fake.stampedCalls[0].updatedAt).toISOString()).toBe(
      fake.stampedCalls[0].updatedAt,
    );
    expect(fake.settingsCalls).toHaveLength(0);
  });

  it('preserves the legacy error-swallow: a repository failure still returns ok', async () => {
    const fake = createFakeRepository();
    fake.setStampedResult(err(domainError('unavailable', 'db down')));
    const setChronoMode = createSetChronoModeCommand(fake.repository);

    const result = await setChronoMode(
      { boardId: 'board-1', mode: 'week', currentSettings: {} },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(fake.stampedCalls).toHaveLength(1);
  });
});

describe('input validation', () => {
  it('rejects invalid input without calling the repository', async () => {
    const fake = createFakeRepository();
    const setMapStyle = createSetMapStyleCommand(fake.repository);

    const result = await setMapStyle({ boardId: 'board-1' }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
    expect(fake.settingsCalls).toHaveLength(0);
  });
});
