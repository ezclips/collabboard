import { describe, expect, it } from 'vitest';
import {
  createCreateLineAndSelectCommand,
  createCreateLineCommand,
  createDeleteLineCommand,
  createUpdateLineCommand,
} from './lines';
import type { LinesRepository } from './lines';
import type { DomainError } from '../core/errors';
import { domainError } from '../core/errors';
import type { Result } from '../core/result';
import { err, ok } from '../core/result';

const ctx = { userId: null };

function createFakeRepository() {
  const insertCalls: object[] = [];
  const insertReturningCalls: object[] = [];
  const updateCalls: Array<{ id: string; payload: Record<string, unknown> }> = [];
  const deleteCalls: string[] = [];

  let insertResult: Result<void, DomainError> = ok(undefined);
  let insertReturningResult: Result<Record<string, unknown> | null, DomainError> = ok({
    id: 'line-1',
  });
  let updateResult: Result<void, DomainError> = ok(undefined);
  let updateThrows: Error | null = null;
  let deleteResult: Result<void, DomainError> = ok(undefined);

  const repository: LinesRepository = {
    insertLine: async (row) => {
      insertCalls.push(row);
      return insertResult;
    },
    insertLineReturning: async (row) => {
      insertReturningCalls.push(row);
      return insertReturningResult;
    },
    updateLineById: async (id, payload) => {
      if (updateThrows) throw updateThrows;
      updateCalls.push({ id, payload: payload as Record<string, unknown> });
      return updateResult;
    },
    deleteLineById: async (id) => {
      deleteCalls.push(id);
      return deleteResult;
    },
  };

  return {
    repository,
    insertCalls,
    insertReturningCalls,
    updateCalls,
    deleteCalls,
    setInsertResult(result: Result<void, DomainError>) {
      insertResult = result;
    },
    setInsertReturningResult(result: Result<Record<string, unknown> | null, DomainError>) {
      insertReturningResult = result;
    },
    setUpdateResult(result: Result<void, DomainError>) {
      updateResult = result;
    },
    setUpdateThrows(error: Error) {
      updateThrows = error;
    },
    setDeleteResult(result: Result<void, DomainError>) {
      deleteResult = result;
    },
  };
}

describe('canvas.createLine', () => {
  it('passes the row through verbatim (same reference) and returns ok', async () => {
    const fake = createFakeRepository();
    const createLine = createCreateLineCommand(fake.repository);
    const row = { board_id: 'board-9', start_x: 1, end_x: 2 };

    const result = await createLine({ row }, ctx);

    expect(result.ok).toBe(true);
    expect(fake.insertCalls).toHaveLength(1);
    expect(fake.insertCalls[0]).toBe(row);
  });

  it('propagates a RESOLVED repository failure unchanged (code unavailable)', async () => {
    const fake = createFakeRepository();
    fake.setInsertResult(err(domainError('unavailable', 'db down')));
    const createLine = createCreateLineCommand(fake.repository);

    const result = await createLine({ row: { board_id: 'board-9' } }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
    }
  });

  it('rejects a non-object row without calling the repository', async () => {
    const fake = createFakeRepository();
    const createLine = createCreateLineCommand(fake.repository);

    const result = await createLine({ row: 'not-a-row' }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
    expect(fake.insertCalls).toHaveLength(0);
  });
});

describe('canvas.createLineAndSelect', () => {
  it('returns the created row from the insert read-back', async () => {
    const fake = createFakeRepository();
    fake.setInsertReturningResult(ok({ id: 'line-42', board_id: 'board-9' }));
    const createLineAndSelect = createCreateLineAndSelectCommand(fake.repository);

    const result = await createLineAndSelect({ row: { board_id: 'board-9' } }, ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ id: 'line-42', board_id: 'board-9' });
    }
    expect(fake.insertReturningCalls).toHaveLength(1);
  });
});

describe('canvas.updateLine', () => {
  it('stamps a fresh ISO updated_at over the given updates and routes to the right id', async () => {
    const fake = createFakeRepository();
    const updateLine = createUpdateLineCommand(fake.repository);

    const result = await updateLine(
      { lineId: 'line-7', updates: { color: '#fff', updated_at: 'stale' } },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(fake.updateCalls).toHaveLength(1);
    expect(fake.updateCalls[0].id).toBe('line-7');
    expect(Object.keys(fake.updateCalls[0].payload).sort()).toEqual(['color', 'updated_at']);
    const stamped = fake.updateCalls[0].payload.updated_at as string;
    expect(stamped).not.toBe('stale');
    expect(new Date(stamped).toISOString()).toBe(stamped);
  });

  it('propagates a RESOLVED repository failure unchanged (code unavailable)', async () => {
    const fake = createFakeRepository();
    fake.setUpdateResult(err(domainError('unavailable', 'db down')));
    const updateLine = createUpdateLineCommand(fake.repository);

    const result = await updateLine({ lineId: 'line-7', updates: { color: '#fff' } }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
    }
  });

  it('surfaces a THROWN repository error as code unknown carrying the original cause', async () => {
    // The channel-discrimination pin: call sites tell the legacy
    // resolved-vs-thrown channels apart via error.code ('unavailable' vs
    // 'unknown'). This pins defineCommand's thrown-mode marker AT the
    // lines aggregate.
    const fake = createFakeRepository();
    const networkError = new Error('fetch failed');
    fake.setUpdateThrows(networkError);
    const updateLine = createUpdateLineCommand(fake.repository);

    const result = await updateLine({ lineId: 'line-7', updates: { color: '#fff' } }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unknown');
      expect(result.error.cause).toBe(networkError);
    }
  });
});

describe('canvas.deleteLine', () => {
  it('deletes exactly the given line', async () => {
    const fake = createFakeRepository();
    const deleteLine = createDeleteLineCommand(fake.repository);

    const result = await deleteLine({ lineId: 'line-5' }, ctx);

    expect(result.ok).toBe(true);
    expect(fake.deleteCalls).toEqual(['line-5']);
  });

  it('propagates a RESOLVED repository failure unchanged (code unavailable)', async () => {
    const fake = createFakeRepository();
    fake.setDeleteResult(err(domainError('unavailable', 'db down')));
    const deleteLine = createDeleteLineCommand(fake.repository);

    const result = await deleteLine({ lineId: 'line-5' }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
    }
  });
});
