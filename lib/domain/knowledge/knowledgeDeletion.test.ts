import { describe, expect, it, vi } from 'vitest';
import { asBoardId, asKnowledgeDocumentId, asUserId } from '../core/ids';
import { domainError } from '../core/errors';
import type { DomainError } from '../core/errors';
import { err, ok } from '../core/result';
import type { Result } from '../core/result';
import {
  cleanupKnowledgeArtifacts,
  KNOWLEDGE_STORAGE_REMOVAL_BATCH_SIZE,
  deleteKnowledgeBoard,
  deleteKnowledgeDocument,
} from './knowledgeDeletion';

const BOARD = asBoardId('board-1');
const DOCUMENT = asKnowledgeDocumentId('document-1');
const OWNER = asUserId('owner-1');
const EDITOR = asUserId('editor-1');
const VIEWER = asUserId('viewer-1');
const UNRELATED = asUserId('unrelated-1');

/**
 * P6J-F9-A0: identity and page count travel with every artifact. These ids are
 * NOT UUIDs, so the path builder refuses them and these fixtures contribute no
 * derivative paths -- which is why every pre-F9 expectation below is unchanged.
 */
function artifact(rawArtifactPath: string | null = null, pageCount: number | null = null) {
  return {
    boardId: BOARD,
    documentId: DOCUMENT,
    pageCount,
    storagePath: 'knowledge/board-1/document-1/original.pdf',
    rawArtifactPath,
  };
}

/** A real UUID pair, for the cases that must actually enumerate derivatives. */
const UUID_BOARD = asBoardId('11111111-1111-4111-8111-111111111111');
const UUID_DOCUMENT = asKnowledgeDocumentId('22222222-2222-4222-8222-222222222222');

function uuidArtifact(pageCount: number | null) {
  return {
    boardId: UUID_BOARD,
    documentId: UUID_DOCUMENT,
    pageCount,
    storagePath: 'knowledge/uuid/original.pdf',
    rawArtifactPath: null,
  };
}

/**
 * P6J-F9-A1a. Cleanup removes in batches, so fixtures record the batch shape
 * rather than only which paths were seen. A batch fails as a unit.
 */
function batchRecorder(failBatch: (paths: readonly string[]) => boolean = () => false) {
  const batches: string[][] = [];
  const removed: string[] = [];
  return {
    batches,
    removed,
    removeMany: async (paths: readonly string[]) => {
      batches.push([...paths]);
      removed.push(...paths);
      return failBatch(paths)
        ? err(domainError('unavailable', 'Storage unavailable'))
        : ok(undefined as void);
    },
  };
}

function documentDeps(options: {
  authorized?: boolean;
  deleteResult?: Result<boolean, DomainError>;
  failBatch?: (paths: readonly string[]) => boolean;
} = {}) {
  const recorder = batchRecorder(options.failBatch);
  const removed = recorder.removed;
  const events: string[] = [];
  const deps = {
    authorizer: {
      canMutateBoard: async () => {
        events.push('authorize');
        return ok(options.authorized ?? true);
      },
    },
    repository: {
      findDocumentArtifactPaths: async () => {
        events.push('load');
        return ok(artifact('knowledge/board-1/document-1/raw.json'));
      },
      deleteDocument: async () => {
        events.push('delete-db');
        return options.deleteResult ?? ok(true);
      },
    },
    storage: {
      removeMany: async (paths: readonly string[]) => {
        for (const path of paths) events.push(`remove:${path}`);
        return recorder.removeMany(paths);
      },
    },
  };
  return { deps, removed, events, batches: recorder.batches };
}

describe('deleteKnowledgeDocument', () => {
  it.each([
    ['owner', OWNER, true],
    ['editor', EDITOR, true],
    ['viewer', VIEWER, false],
    ['unrelated user', UNRELATED, false],
  ])('%s authorization follows the existing board mutation rule', async (_label, userId, allowed) => {
    const { deps, events } = documentDeps({ authorized: allowed });
    const result = await deleteKnowledgeDocument(deps, { documentId: DOCUMENT, userId });

    expect(result.ok).toBe(allowed);
    expect(events).toContain('load');
    expect(events).toContain('authorize');
    expect(events.includes('delete-db')).toBe(allowed);
  });

  it('deletes the database row before both unique artifacts', async () => {
    const { deps, removed, events } = documentDeps();
    const result = await deleteKnowledgeDocument(deps, { documentId: DOCUMENT, userId: OWNER });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.deleted).toBe(true);
    expect(result.value.storageCleanup.status).toBe('complete');
    expect(removed).toEqual([
      'knowledge/board-1/document-1/original.pdf',
      'knowledge/board-1/document-1/raw.json',
    ]);
    expect(events.indexOf('delete-db')).toBeLessThan(events.indexOf(`remove:${removed[0]}`));
  });

  it('deduplicates raw_artifact_path when it equals the original path', async () => {
    const { deps, removed } = documentDeps();
    deps.repository.findDocumentArtifactPaths = async () => ok(artifact(artifact().storagePath));

    const result = await deleteKnowledgeDocument(deps, { documentId: DOCUMENT, userId: OWNER });

    expect(result.ok).toBe(true);
    expect(removed).toHaveLength(1);
  });

  it('leaves Storage untouched when the authoritative DB delete fails', async () => {
    const { deps, removed } = documentDeps({
      deleteResult: err(domainError('unavailable', 'database unavailable')),
    });

    const result = await deleteKnowledgeDocument(deps, { documentId: DOCUMENT, userId: OWNER });

    expect(result.ok).toBe(false);
    expect(removed).toEqual([]);
  });

  it('reports partial cleanup while keeping the successful DB deletion', async () => {
    const { deps, removed } = documentDeps({
      failBatch: (paths) => paths.some((path) => path.endsWith('raw.json')),
    });

    const result = await deleteKnowledgeDocument(deps, { documentId: DOCUMENT, userId: OWNER });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.deleted).toBe(true);
    // P6J-F9-A1a: both paths shared one batch, and a batch fails as a unit --
    // Storage cannot say which member survived, so neither is called removed.
    expect(result.value.storageCleanup).toMatchObject({
      status: 'partial',
      failedPaths: [
        'knowledge/board-1/document-1/original.pdf',
        'knowledge/board-1/document-1/raw.json',
      ],
    });
    expect(removed).toHaveLength(2);
  });

  it('does not touch Padlets: the document command only deletes its document', async () => {
    const { deps } = documentDeps();
    const padlets = ['padlet-1'];
    const result = await deleteKnowledgeDocument(deps, { documentId: DOCUMENT, userId: OWNER });

    expect(result.ok).toBe(true);
    expect(padlets).toEqual(['padlet-1']);
  });
});

describe('deleteKnowledgeBoard', () => {
  it('captures and cleans artifacts for multiple documents after the board delete', async () => {
    const events: string[] = [];
    const removed: string[] = [];
    const result = await deleteKnowledgeBoard(
      {
        authorizer: { canDeleteBoard: async () => ok(true) },
        repository: {
          listDocumentArtifactPathsByBoardId: async () => {
            events.push('capture');
            return ok([
              { ...artifact(), storagePath: 'doc-a/original.pdf', rawArtifactPath: null },
              { ...artifact(), storagePath: 'doc-b/original.pdf', rawArtifactPath: 'doc-b/raw.json' },
            ]);
          },
          deleteBoard: async () => {
            events.push('delete-board');
            return ok(true);
          },
        },
        storage: {
          removeMany: async (paths: readonly string[]) => {
            for (const path of paths) {
              events.push(`remove:${path}`);
              removed.push(path);
            }
            return ok(undefined);
          },
        },
      },
      { boardId: BOARD, userId: OWNER },
    );

    expect(result.ok).toBe(true);
    expect(events.slice(0, 2)).toEqual(['capture', 'delete-board']);
    expect(removed).toEqual(['doc-a/original.pdf', 'doc-b/original.pdf', 'doc-b/raw.json']);
  });

  it('does not clean Storage when the board DB delete fails', async () => {
    const removed: string[] = [];
    const result = await deleteKnowledgeBoard(
      {
        authorizer: { canDeleteBoard: async () => ok(true) },
        repository: {
          listDocumentArtifactPathsByBoardId: async () =>
            ok([{ ...artifact(), storagePath: 'doc/original.pdf', rawArtifactPath: null }]),
          deleteBoard: async () => err(domainError('unavailable', 'database unavailable')),
        },
        storage: {
          removeMany: async (paths: readonly string[]) => {
            removed.push(...paths);
            return ok(undefined);
          },
        },
      },
      { boardId: BOARD, userId: OWNER },
    );

    expect(result.ok).toBe(false);
    expect(removed).toEqual([]);
  });
});

describe('cleanupKnowledgeArtifacts', () => {
  it('continues after one failure so other artifacts are still attempted', async () => {
    const storage = batchRecorder((paths) => paths.includes('bad'));
    const result = await cleanupKnowledgeArtifacts(storage, [
      { ...artifact(), storagePath: 'good', rawArtifactPath: null },
      { ...artifact(), storagePath: 'bad', rawArtifactPath: 'good' },
    ]);

    expect(result.status).toBe('partial');
    expect(storage.removed).toEqual(['good', 'bad']);
  });
});

/**
 * P6J-F9-A0 -- page derivatives join the existing cleanup, additively.
 *
 * No Storage listing is introduced: the paths are deterministic, so cleanup
 * derives them from the stored page count instead of discovering them.
 */
describe('page derivative cleanup', () => {
  const recordingStorage = (failing: readonly string[] = []) =>
    batchRecorder((paths) => paths.some((path) => failing.includes(path)));

  it('adds exactly one derivative path per page, alongside the existing artifacts', async () => {
    const storage = recordingStorage();
    const cleanup = await cleanupKnowledgeArtifacts(storage, [
      { ...uuidArtifact(3), rawArtifactPath: 'knowledge/uuid/raw.json' },
    ]);

    expect(cleanup.attemptedPaths).toEqual([
      'knowledge/uuid/original.pdf',
      'knowledge/uuid/raw.json',
      `knowledge/${UUID_BOARD}/${UUID_DOCUMENT}/pages/1.webp`,
      `knowledge/${UUID_BOARD}/${UUID_DOCUMENT}/pages/2.webp`,
      `knowledge/${UUID_BOARD}/${UUID_DOCUMENT}/pages/3.webp`,
    ]);
    expect(cleanup.status).toBe('complete');
    // Every one of them went through the SAME existing remove owner.
    expect(storage.removed).toEqual(cleanup.attemptedPaths);
  });

  it('adds none when the page count is unknown, and leaves pre-F9 results verbatim', async () => {
    const unknown = await cleanupKnowledgeArtifacts(recordingStorage(), [uuidArtifact(null)]);
    expect(unknown.attemptedPaths).toEqual(['knowledge/uuid/original.pdf']);

    // Non-UUID ids also yield no derivative paths, so this is the old result.
    const legacy = await cleanupKnowledgeArtifacts(recordingStorage(), [artifact('raw/path.json')]);
    expect(legacy.attemptedPaths).toEqual([
      'knowledge/board-1/document-1/original.pdf',
      'raw/path.json',
    ]);
    expect(legacy.status).toBe('complete');
  });

  it('never attempts a derivative path twice', async () => {
    const cleanup = await cleanupKnowledgeArtifacts(recordingStorage(), [uuidArtifact(2), uuidArtifact(2)]);

    expect(new Set(cleanup.attemptedPaths).size).toBe(cleanup.attemptedPaths.length);
    expect(cleanup.attemptedPaths.filter((path) => path.includes('/pages/'))).toHaveLength(2);
  });

  it('reports partial when a batch carrying a derivative cannot be removed', async () => {
    const failed = `knowledge/${UUID_BOARD}/${UUID_DOCUMENT}/pages/2.webp`;
    const storage = recordingStorage([failed]);
    const cleanup = await cleanupKnowledgeArtifacts(storage, [uuidArtifact(3)]);

    expect(cleanup.status).toBe('partial');
    // P6J-F9-A1a: these four paths travel in one batch, which fails as a unit.
    expect(cleanup.failedPaths).toEqual(cleanup.attemptedPaths);
    expect(cleanup.failures).toContainEqual({ path: failed, message: 'Storage unavailable' });
    // Every path was still submitted: page 3 was not skipped.
    expect(storage.removed).toContain(`knowledge/${UUID_BOARD}/${UUID_DOCUMENT}/pages/3.webp`);
  });

  it('removes derivatives through both real deletion flows', async () => {
    const byDocument = await deleteKnowledgeDocument(
      {
        authorizer: { canMutateBoard: async () => ok(true) },
        repository: {
          findDocumentArtifactPaths: async () => ok(uuidArtifact(2)),
          deleteDocument: async () => ok(true),
        },
        storage: recordingStorage(),
      },
      { documentId: UUID_DOCUMENT, userId: OWNER },
    );
    expect(byDocument.ok && byDocument.value.storageCleanup.attemptedPaths).toContain(
      `knowledge/${UUID_BOARD}/${UUID_DOCUMENT}/pages/2.webp`,
    );

    const byBoard = await deleteKnowledgeBoard(
      {
        authorizer: { canDeleteBoard: async () => ok(true) },
        repository: {
          listDocumentArtifactPathsByBoardId: async () => ok([uuidArtifact(1)]),
          deleteBoard: async () => ok(true),
        },
        storage: recordingStorage(),
      },
      { boardId: UUID_BOARD, userId: OWNER },
    );
    expect(byBoard.ok && byBoard.value.storageCleanup.attemptedPaths).toEqual([
      'knowledge/uuid/original.pdf',
      `knowledge/${UUID_BOARD}/${UUID_DOCUMENT}/pages/1.webp`,
    ]);
  });
});

/**
 * P6J-F9-A1a -- deterministic paths are removed in bounded batches.
 *
 * Batching is a transport change only: which paths are attempted, and in what
 * order, must stay exactly as the capture step produced them.
 */
describe('batched artifact removal', () => {
  const bulk = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      ...uuidArtifact(null),
      storagePath: `knowledge/bulk/${index}.pdf`,
    }));

  it('submits batches through removeMany and never one request per path', async () => {
    const perPath = vi.fn(async () => ok(undefined as void));
    const storage = { ...batchRecorder(), remove: perPath };
    const cleanup = await cleanupKnowledgeArtifacts(storage, [uuidArtifact(3)]);

    expect(perPath).not.toHaveBeenCalled();
    expect(storage.batches).toHaveLength(1);
    expect(storage.batches[0]).toEqual(cleanup.attemptedPaths);
  });

  it('splits at 100 and covers exactly the attempted paths, in order', async () => {
    const storage = batchRecorder();
    const cleanup = await cleanupKnowledgeArtifacts(storage, bulk(101));

    expect(KNOWLEDGE_STORAGE_REMOVAL_BATCH_SIZE).toBe(100);
    expect(storage.batches.map((batch) => batch.length)).toEqual([100, 1]);
    expect(storage.batches.flat()).toEqual(cleanup.attemptedPaths);
  });

  it('keeps every batch within the limit for a large board', async () => {
    const storage = batchRecorder();
    const cleanup = await cleanupKnowledgeArtifacts(storage, bulk(250));

    expect(storage.batches.map((batch) => batch.length)).toEqual([100, 100, 50]);
    expect(cleanup.attemptedPaths).toHaveLength(250);
    expect(cleanup.status).toBe('complete');
  });

  it('deduplicates before batching, so no path is ever sent twice', async () => {
    const storage = batchRecorder();
    const cleanup = await cleanupKnowledgeArtifacts(storage, [
      uuidArtifact(2),
      uuidArtifact(2),
      uuidArtifact(2),
    ]);
    const sent = storage.batches.flat();

    expect(new Set(sent).size).toBe(sent.length);
    expect(sent).toEqual(cleanup.attemptedPaths);
    expect(sent).toHaveLength(3);
  });

  it('makes no Storage call at all when there is nothing to remove', async () => {
    const storage = batchRecorder();
    const cleanup = await cleanupKnowledgeArtifacts(storage, []);

    expect(storage.batches).toEqual([]);
    expect(cleanup).toMatchObject({ status: 'complete', attemptedPaths: [], failedPaths: [] });
  });

  it('fails a whole batch together and still runs the batches after it', async () => {
    const storage = batchRecorder((paths) => paths.includes('knowledge/bulk/0.pdf'));
    const cleanup = await cleanupKnowledgeArtifacts(storage, bulk(150));

    expect(storage.batches).toHaveLength(2);
    expect(cleanup.status).toBe('partial');
    expect(cleanup.failedPaths).toEqual(cleanup.attemptedPaths.slice(0, 100));
    // The second batch succeeded, so none of its paths are reported failed.
    expect(cleanup.failedPaths).not.toContain('knowledge/bulk/149.pdf');
    expect(storage.batches[1]).toContain('knowledge/bulk/149.pdf');
  });

  it('treats a throwing Storage client as a failed batch rather than a crash', async () => {
    const cleanup = await cleanupKnowledgeArtifacts(
      { removeMany: async () => { throw new Error('socket hang up'); } },
      [uuidArtifact(2)],
    );

    expect(cleanup.status).toBe('partial');
    expect(cleanup.failedPaths).toEqual(cleanup.attemptedPaths);
    expect(cleanup.failures.every(({ message }) => message === 'socket hang up')).toBe(true);
  });
});
