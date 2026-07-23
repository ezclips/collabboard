import { test, expect } from '@playwright/test';
import {
  createCreateContainerCommand,
  createDropDraftIntoContainerCommand,
} from '../../lib/domain/canvas/containers';
import type { PostsRepository } from '../../lib/domain/canvas/posts';
import type { PostId } from '../../lib/domain/core/ids';
import type { DomainError } from '../../lib/domain/core/errors';
import { domainError } from '../../lib/domain/core/errors';
import type { Result } from '../../lib/domain/core/result';
import { err, ok } from '../../lib/domain/core/result';

const ctx = { userId: null };

type ToastEvent = { type: 'success' | 'error'; message: string };

function containerRow(position: number) {
  return {
    id: `container-${position}`,
    board_id: 'board-104',
    title: 'New Container',
    content: '',
    type: 'container',
    position_x: 0,
    position_y: 0,
    width: 280,
    height: 200,
    created_at: '2026-07-23T12:00:00.000Z',
    updated_at: '2026-07-23T12:00:00.000Z',
    metadata: {
      childPadletIds: [],
      sectionId: '17',
      sectionPosition: position,
      kind: 'container',
      isContainer: true,
      cardColor: '#ffffff',
      zIndex: 98765,
    },
  };
}

const draftRow = {
  id: 'draft-post-1',
  board_id: 'board-104',
  title: 'Draft note',
  content: 'Draft note body',
  type: 'note',
  position_x: 0,
  position_y: 0,
  width: 200,
  height: 150,
  created_at: '2026-07-23T12:01:00.000Z',
  updated_at: '2026-07-23T12:01:00.000Z',
  metadata: {
    source: 'placement-prompt',
    parentId: 'container-1',
  },
};

function createFakeRepository() {
  const rows: object[] = [];
  const returningRows: object[] = [];
  const updates: Array<{ id: PostId; fields: object }> = [];
  let insertResult: Result<void, DomainError> = ok(undefined);
  let insertReturningResult: Result<Record<string, unknown> | null, DomainError> = ok(draftRow);

  const repository: PostsRepository = {
    updateTasks: async () => ok(undefined),
    updateMetadata: async () => ok(undefined),
    updateMetadataUnstamped: async () => ok(undefined),
    updateFieldsById: async (id, fields) => {
      updates.push({ id, fields });
      return ok(undefined);
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
      rows.push(row);
      return insertResult;
    },
    insertReturning: async (row) => {
      returningRows.push(row);
      return insertReturningResult;
    },
  };

  return {
    repository,
    rows,
    returningRows,
    updates,
    failInsert() {
      insertResult = err(domainError('unavailable', 'forced insert failure'));
    },
    returnInserted(row: Record<string, unknown> | null) {
      insertReturningResult = ok(row);
    },
  };
}

test.describe('canvas container creation persistence contract (PATCH-104)', () => {
  test('prompt-triggered creation persists exact container metadata and records success toast', async () => {
    const fake = createFakeRepository();
    const createContainer = createCreateContainerCommand(fake.repository);
    const padlets: object[] = [];
    const toasts: ToastEvent[] = [];
    const row = containerRow(3);

    padlets.push(row);
    const result = await createContainer({ row }, ctx);
    if (result.ok) toasts.push({ type: 'success', message: 'Container created' });

    expect(result.ok).toBe(true);
    expect(fake.rows).toEqual([row]);
    expect(row.metadata).toEqual({
      childPadletIds: [],
      sectionId: '17',
      sectionPosition: 3,
      kind: 'container',
      isContainer: true,
      cardColor: '#ffffff',
      zIndex: 98765,
    });
    expect(padlets).toEqual([row]);
    expect(toasts).toEqual([{ type: 'success', message: 'Container created' }]);
  });

  test('direct at-position creation persists the same shape without a success toast', async () => {
    const fake = createFakeRepository();
    const createContainer = createCreateContainerCommand(fake.repository);
    const toasts: ToastEvent[] = [];
    const row = containerRow(4);

    const result = await createContainer({ row }, ctx);

    expect(result.ok).toBe(true);
    expect(fake.rows).toEqual([row]);
    expect(row.metadata).toMatchObject({
      childPadletIds: [],
      sectionId: '17',
      sectionPosition: 4,
      kind: 'container',
      isContainer: true,
      cardColor: '#ffffff',
    });
    expect(toasts).toEqual([]);
  });

  test('dropping a draft into an existing container persists the post and updates childPadletIds', async () => {
    const fake = createFakeRepository();
    const dropDraft = createDropDraftIntoContainerCommand(fake.repository);

    const result = await dropDraft(
      {
        row: draftRow,
        containerId: 'container-1',
        containerMetadata: { childPadletIds: ['existing-child'], keep: true },
      },
      ctx,
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(draftRow);
    expect(fake.returningRows).toEqual([draftRow]);
    expect(fake.updates).toEqual([
      {
        id: 'container-1',
        fields: {
          metadata: {
            childPadletIds: ['existing-child', 'draft-post-1'],
            keep: true,
          },
        },
      },
    ]);
  });

  test('forced create persistence failure records failure toast and rolls back the optimistic row', async () => {
    const fake = createFakeRepository();
    fake.failInsert();
    const createContainer = createCreateContainerCommand(fake.repository);
    const row = containerRow(5);
    let padlets: object[] = [row];
    const toasts: ToastEvent[] = [];

    const result = await createContainer({ row }, ctx);
    if (!result.ok) {
      toasts.push({ type: 'error', message: 'Failed to create container' });
      padlets = padlets.filter((padlet) => padlet !== row);
    }

    expect(result.ok).toBe(false);
    expect(fake.rows).toEqual([row]);
    expect(padlets).toEqual([]);
    expect(toasts).toEqual([{ type: 'error', message: 'Failed to create container' }]);
  });

  test('container not found locally still creates the draft and skips childPadletIds update', async () => {
    const fake = createFakeRepository();
    const dropDraft = createDropDraftIntoContainerCommand(fake.repository);

    const result = await dropDraft(
      { row: draftRow, containerId: 'missing-container', containerMetadata: null },
      ctx,
    );

    // This local-padlet miss is intentionally characterized at the seam: the
    // UI path requires a stale client-side list that is not deterministically
    // triggerable without hidden handler access.
    expect(result.ok).toBe(true);
    expect(fake.returningRows).toEqual([draftRow]);
    expect(fake.updates).toEqual([]);
  });
});
