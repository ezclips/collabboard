import { describe, expect, it } from 'vitest';
import {
  createCreateSectionCommand,
  createCreateSectionsCommand,
  createDeleteSectionCommand,
  createRenameSectionCommand,
  createReorderSectionsCommand,
  createSwapSectionPositionsCommand,
} from './sections';
import type { SectionInsertFields, SectionPositionFields, SectionsRepository } from './sections';
import type { DomainError } from '../core/errors';
import { domainError } from '../core/errors';
import type { Result } from '../core/result';
import { err, ok } from '../core/result';

const ctx = { userId: null };

function createFakeRepository() {
  const insertCalls: SectionInsertFields[] = [];
  const insertManyCalls: Array<readonly SectionInsertFields[]> = [];
  const renameCalls: Array<{ id: number; title: string; updatedAt: string }> = [];
  const positionCalls: Array<{ id: number; fields: SectionPositionFields }> = [];
  const deleteCalls: number[] = [];

  let insertResult: Result<Record<string, unknown> | null, DomainError> = ok({ id: 7 });
  let insertManyResult: Result<Array<Record<string, unknown>> | null, DomainError> = ok([]);
  const positionResults: Array<Result<void, DomainError>> = [];
  let renameResult: Result<void, DomainError> = ok(undefined);
  let deleteResult: Result<void, DomainError> = ok(undefined);

  const repository: SectionsRepository = {
    insertSection: async (fields) => {
      insertCalls.push(fields);
      return insertResult;
    },
    insertSections: async (fields) => {
      insertManyCalls.push(fields);
      return insertManyResult;
    },
    renameSection: async (id, fields) => {
      renameCalls.push({ id, title: fields.title, updatedAt: fields.updatedAt });
      return renameResult;
    },
    updateSectionPosition: async (id, fields) => {
      positionCalls.push({ id, fields });
      return positionResults.shift() ?? ok(undefined);
    },
    deleteSection: async (id) => {
      deleteCalls.push(id);
      return deleteResult;
    },
  };

  return {
    repository,
    insertCalls,
    insertManyCalls,
    renameCalls,
    positionCalls,
    deleteCalls,
    setInsertResult(result: Result<Record<string, unknown> | null, DomainError>) {
      insertResult = result;
    },
    setInsertManyResult(result: Result<Array<Record<string, unknown>> | null, DomainError>) {
      insertManyResult = result;
    },
    queuePositionResult(result: Result<void, DomainError>) {
      positionResults.push(result);
    },
    setRenameResult(result: Result<void, DomainError>) {
      renameResult = result;
    },
    setDeleteResult(result: Result<void, DomainError>) {
      deleteResult = result;
    },
  };
}

describe('canvas.createSection', () => {
  it('sends an empty description with the given board, title, and position, returning the created row', async () => {
    const fake = createFakeRepository();
    fake.setInsertResult(ok({ id: 41, title: 'Section 3' }));
    const createSection = createCreateSectionCommand(fake.repository);

    const result = await createSection(
      { boardId: 'board-9', title: 'Section 3', position: 2 },
      ctx,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ id: 41, title: 'Section 3' });
    }
    expect(fake.insertCalls).toEqual([
      { boardId: 'board-9', title: 'Section 3', description: '', position: 2 },
    ]);
  });

  it('propagates a repository failure unchanged', async () => {
    const fake = createFakeRepository();
    fake.setInsertResult(err(domainError('unavailable', 'db down')));
    const createSection = createCreateSectionCommand(fake.repository);

    const result = await createSection(
      { boardId: 'board-9', title: 'Section 1', position: 0 },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
    }
  });
});

describe('canvas.createSections', () => {
  it('merges the board id into every row and returns all created rows', async () => {
    const fake = createFakeRepository();
    fake.setInsertManyResult(ok([{ id: 51 }, { id: 52 }]));
    const createSections = createCreateSectionsCommand(fake.repository);

    const result = await createSections(
      {
        boardId: 'board-9',
        sections: [
          { title: 'Recovered Section 1', description: '', position: 3 },
          { title: 'Recovered Section 2', description: '', position: 4 },
        ],
      },
      ctx,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([{ id: 51 }, { id: 52 }]);
    }
    expect(fake.insertManyCalls).toEqual([
      [
        { boardId: 'board-9', title: 'Recovered Section 1', description: '', position: 3 },
        { boardId: 'board-9', title: 'Recovered Section 2', description: '', position: 4 },
      ],
    ]);
  });

  it('propagates a repository failure unchanged', async () => {
    const fake = createFakeRepository();
    fake.setInsertManyResult(err(domainError('unavailable', 'db down')));
    const createSections = createCreateSectionsCommand(fake.repository);

    const result = await createSections(
      {
        boardId: 'board-9',
        sections: [{ title: 'Recovered Section 1', description: '', position: 0 }],
      },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
    }
  });

  it('rejects a non-numeric position without calling the repository', async () => {
    const fake = createFakeRepository();
    const createSections = createCreateSectionsCommand(fake.repository);

    const result = await createSections(
      {
        boardId: 'board-9',
        sections: [{ title: 'Recovered Section 1', description: '', position: '3' }],
      },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
    expect(fake.insertManyCalls).toHaveLength(0);
  });
});

describe('canvas.renameSection', () => {
  it('sends the new title with an ISO timestamp to the right section', async () => {
    const fake = createFakeRepository();
    const renameSection = createRenameSectionCommand(fake.repository);

    const result = await renameSection({ sectionId: 12, title: 'Sprint' }, ctx);

    expect(result.ok).toBe(true);
    expect(fake.renameCalls).toHaveLength(1);
    expect(fake.renameCalls[0].id).toBe(12);
    expect(fake.renameCalls[0].title).toBe('Sprint');
    expect(new Date(fake.renameCalls[0].updatedAt).toISOString()).toBe(
      fake.renameCalls[0].updatedAt,
    );
  });

  it('rejects invalid input without calling the repository', async () => {
    const fake = createFakeRepository();
    const renameSection = createRenameSectionCommand(fake.repository);

    const result = await renameSection({ sectionId: 12 }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
    expect(fake.renameCalls).toHaveLength(0);
  });
});

describe('canvas.deleteSection', () => {
  it('deletes exactly the given section', async () => {
    const fake = createFakeRepository();
    const deleteSection = createDeleteSectionCommand(fake.repository);

    const result = await deleteSection({ sectionId: 5 }, ctx);

    expect(result.ok).toBe(true);
    expect(fake.deleteCalls).toEqual([5]);
  });
});

describe('canvas.swapSectionPositions', () => {
  it('updates first then second with the given positions', async () => {
    const fake = createFakeRepository();
    const swapPositions = createSwapSectionPositionsCommand(fake.repository);

    const result = await swapPositions(
      { first: { sectionId: 3, position: 1 }, second: { sectionId: 4, position: 0 } },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(fake.positionCalls.map((c) => ({ id: c.id, position: c.fields.position }))).toEqual([
      { id: 3, position: 1 },
      { id: 4, position: 0 },
    ]);
  });

  it('stops after a first-update failure - the second section is never touched', async () => {
    const fake = createFakeRepository();
    fake.queuePositionResult(err(domainError('unavailable', 'db down')));
    const swapPositions = createSwapSectionPositionsCommand(fake.repository);

    const result = await swapPositions(
      { first: { sectionId: 3, position: 1 }, second: { sectionId: 4, position: 0 } },
      ctx,
    );

    expect(result.ok).toBe(false);
    expect(fake.positionCalls).toHaveLength(1);
    expect(fake.positionCalls[0].id).toBe(3);
  });

  it('reports a second-update failure with the first already applied (legacy partial failure)', async () => {
    const fake = createFakeRepository();
    fake.queuePositionResult(ok(undefined));
    fake.queuePositionResult(err(domainError('unavailable', 'db down')));
    const swapPositions = createSwapSectionPositionsCommand(fake.repository);

    const result = await swapPositions(
      { first: { sectionId: 3, position: 1 }, second: { sectionId: 4, position: 0 } },
      ctx,
    );

    expect(result.ok).toBe(false);
    expect(fake.positionCalls).toHaveLength(2);
  });
});

describe('canvas.reorderSections', () => {
  it('updates every section with its index as the new position', async () => {
    const fake = createFakeRepository();
    const reorderSections = createReorderSectionsCommand(fake.repository);

    const result = await reorderSections({ sectionIds: [9, 7, 8] }, ctx);

    expect(result.ok).toBe(true);
    expect(fake.positionCalls.map((c) => ({ id: c.id, position: c.fields.position }))).toEqual([
      { id: 9, position: 0 },
      { id: 7, position: 1 },
      { id: 8, position: 2 },
    ]);
  });

  it('preserves the legacy error-swallow: row-level failures still return ok', async () => {
    const fake = createFakeRepository();
    fake.queuePositionResult(err(domainError('unavailable', 'db down')));
    fake.queuePositionResult(err(domainError('unavailable', 'db down')));
    const reorderSections = createReorderSectionsCommand(fake.repository);

    const result = await reorderSections({ sectionIds: [9, 7] }, ctx);

    expect(result.ok).toBe(true);
    expect(fake.positionCalls).toHaveLength(2);
  });

  it('rejects non-numeric ids without calling the repository', async () => {
    const fake = createFakeRepository();
    const reorderSections = createReorderSectionsCommand(fake.repository);

    const result = await reorderSections({ sectionIds: ['9'] }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
    expect(fake.positionCalls).toHaveLength(0);
  });
});
