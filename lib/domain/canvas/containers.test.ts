import { describe, expect, it } from 'vitest';
import {
  createCreateContainerCommand,
  createDropDraftIntoContainerCommand,
} from './containers';
import type { PostsRepository } from './posts';
import type { PostId } from '../core/ids';
import type { DomainError } from '../core/errors';
import { domainError } from '../core/errors';
import type { Result } from '../core/result';
import { err, ok } from '../core/result';

const ctx = { userId: null };

const containerRow = {
  id: 'container-1',
  board_id: 'board-1',
  title: 'New Container',
  content: '',
  type: 'container',
  position_x: 0,
  position_y: 0,
  width: 280,
  height: 200,
  created_at: '2026-07-23T10:00:00.000Z',
  updated_at: '2026-07-23T10:00:00.000Z',
  metadata: {
    childPadletIds: [],
    sectionId: '7',
    sectionPosition: 2,
    kind: 'container',
    isContainer: true,
    cardColor: '#ffffff',
    zIndex: 12345,
  },
};

const draftRow = {
  id: 'post-1',
  board_id: 'board-1',
  title: 'Draft',
  content: 'body',
  type: 'note',
  position_x: 0,
  position_y: 0,
  width: 200,
  height: 150,
  created_at: '2026-07-23T10:01:00.000Z',
  updated_at: '2026-07-23T10:01:00.000Z',
  metadata: {
    color: '#fff7cc',
    parentId: 'container-1',
  },
};

function createFakeRepository() {
  const insertCalls: object[] = [];
  const insertReturningCalls: object[] = [];
  const updateFieldsCalls: Array<{ id: PostId; fields: object }> = [];
  let insertResult: Result<void, DomainError> = ok(undefined);
  let insertReturningResult: Result<Record<string, unknown> | null, DomainError> = ok(draftRow);
  let updateFieldsResult: Result<void, DomainError> = ok(undefined);
  let updateFieldsThrows: Error | null = null;

  const repository: PostsRepository = {
    updateTasks: async () => ok(undefined),
    updateMetadata: async () => ok(undefined),
    updateMetadataUnstamped: async () => ok(undefined),
    updateFieldsById: async (id, fields) => {
      if (updateFieldsThrows) throw updateFieldsThrows;
      updateFieldsCalls.push({ id, fields });
      return updateFieldsResult;
    },
    updatePosition: async () => ok(undefined),
    updateTitle: async () => ok(undefined),
    updateContent: async () => ok(undefined),
    updateTitleStamped: async () => ok(undefined),
    findMetadataById: async () => ok(null),
    deleteById: async () => ok(undefined),
    deleteByIds: async () => ok(undefined),
    deleteByParentId: async () => ok(undefined),
    insert: async (row) => {
      insertCalls.push(row);
      return insertResult;
    },
    insertReturning: async (row) => {
      insertReturningCalls.push(row);
      return insertReturningResult;
    },
  };

  return {
    repository,
    insertCalls,
    insertReturningCalls,
    updateFieldsCalls,
    setInsertResult(result: Result<void, DomainError>) {
      insertResult = result;
    },
    setInsertReturningResult(result: Result<Record<string, unknown> | null, DomainError>) {
      insertReturningResult = result;
    },
    setUpdateFieldsResult(result: Result<void, DomainError>) {
      updateFieldsResult = result;
    },
    setUpdateFieldsThrows(error: Error) {
      updateFieldsThrows = error;
    },
  };
}

describe('canvas.createContainer', () => {
  it('inserts the container row exactly as provided', async () => {
    const fake = createFakeRepository();
    const createContainer = createCreateContainerCommand(fake.repository);

    const result = await createContainer({ row: containerRow }, ctx);

    expect(result.ok).toBe(true);
    expect(fake.insertCalls).toEqual([containerRow]);
    expect(createContainer.name).toBe('canvas.createContainer');
  });

  it('propagates insert repository failure unchanged', async () => {
    const fake = createFakeRepository();
    fake.setInsertResult(err(domainError('unavailable', 'db down')));
    const createContainer = createCreateContainerCommand(fake.repository);

    const result = await createContainer({ row: containerRow }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('unavailable');
  });

  it('rejects malformed input without writing', async () => {
    const fake = createFakeRepository();
    const createContainer = createCreateContainerCommand(fake.repository);

    const result = await createContainer({ row: null }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('validation');
    expect(fake.insertCalls).toHaveLength(0);
  });
});

describe('canvas.dropDraftIntoContainer', () => {
  it('inserts the draft row, returns the created row, and updates childPadletIds', async () => {
    const fake = createFakeRepository();
    const dropDraftIntoContainer = createDropDraftIntoContainerCommand(fake.repository);

    const result = await dropDraftIntoContainer(
      {
        row: draftRow,
        containerId: 'container-1',
        containerMetadata: { childPadletIds: ['existing'], label: 'keep' },
      },
      ctx,
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(draftRow);
    expect(fake.insertReturningCalls).toEqual([draftRow]);
    expect(fake.updateFieldsCalls).toEqual([
      {
        id: 'container-1',
        fields: {
          metadata: {
            childPadletIds: ['existing', 'post-1'],
            label: 'keep',
          },
        },
      },
    ]);
    expect(dropDraftIntoContainer.name).toBe('canvas.dropDraftIntoContainer');
  });

  it('treats non-array childPadletIds as the legacy empty list', async () => {
    const fake = createFakeRepository();
    const dropDraftIntoContainer = createDropDraftIntoContainerCommand(fake.repository);

    await dropDraftIntoContainer(
      {
        row: draftRow,
        containerId: 'container-1',
        containerMetadata: { childPadletIds: 'corrupt', label: 'keep' },
      },
      ctx,
    );

    expect(fake.updateFieldsCalls[0].fields).toEqual({
      metadata: {
        childPadletIds: ['post-1'],
        label: 'keep',
      },
    });
  });

  it('skips the container metadata update when the container is missing locally', async () => {
    const fake = createFakeRepository();
    const dropDraftIntoContainer = createDropDraftIntoContainerCommand(fake.repository);

    const result = await dropDraftIntoContainer(
      { row: draftRow, containerId: 'container-1', containerMetadata: null },
      ctx,
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(draftRow);
    expect(fake.insertReturningCalls).toEqual([draftRow]);
    expect(fake.updateFieldsCalls).toHaveLength(0);
  });

  it('propagates insertReturning failure without updating the container', async () => {
    const fake = createFakeRepository();
    fake.setInsertReturningResult(err(domainError('unavailable', 'insert failed')));
    const dropDraftIntoContainer = createDropDraftIntoContainerCommand(fake.repository);

    const result = await dropDraftIntoContainer(
      {
        row: draftRow,
        containerId: 'container-1',
        containerMetadata: { childPadletIds: [] },
      },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('unavailable');
    expect(fake.updateFieldsCalls).toHaveLength(0);
  });

  it('preserves the created row on a thrown container-update failure after post success', async () => {
    const fake = createFakeRepository();
    const thrown = new Error('network dropped');
    fake.setUpdateFieldsThrows(thrown);
    const dropDraftIntoContainer = createDropDraftIntoContainerCommand(fake.repository);

    const result = await dropDraftIntoContainer(
      {
        row: draftRow,
        containerId: 'container-1',
        containerMetadata: { childPadletIds: [] },
      },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unknown');
      expect(result.error.cause).toBe(thrown);
      expect(result.error.details).toEqual({ created: draftRow });
    }
    expect(fake.insertReturningCalls).toEqual([draftRow]);
  });

  it('swallows a resolved container-update failure after post success', async () => {
    const fake = createFakeRepository();
    fake.setUpdateFieldsResult(err(domainError('unavailable', 'update failed')));
    const dropDraftIntoContainer = createDropDraftIntoContainerCommand(fake.repository);

    const result = await dropDraftIntoContainer(
      {
        row: draftRow,
        containerId: 'container-1',
        containerMetadata: { childPadletIds: [] },
      },
      ctx,
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(draftRow);
  });

  it('rejects malformed input without writing', async () => {
    const fake = createFakeRepository();
    const dropDraftIntoContainer = createDropDraftIntoContainerCommand(fake.repository);

    const result = await dropDraftIntoContainer(
      { row: draftRow, containerId: 12, containerMetadata: null },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('validation');
    expect(fake.insertReturningCalls).toHaveLength(0);
  });
});
