import { describe, expect, it } from 'vitest';
import { asBoardId, asKnowledgeDocumentId, asUserId } from '../core/ids';
import { domainError } from '../core/errors';
import type { DomainError } from '../core/errors';
import { err, ok } from '../core/result';
import type { Result } from '../core/result';
import {
  cleanupKnowledgeArtifacts,
  deleteKnowledgeBoard,
  deleteKnowledgeDocument,
} from './knowledgeDeletion';

const BOARD = asBoardId('board-1');
const DOCUMENT = asKnowledgeDocumentId('document-1');
const OWNER = asUserId('owner-1');
const EDITOR = asUserId('editor-1');
const VIEWER = asUserId('viewer-1');
const UNRELATED = asUserId('unrelated-1');

function artifact(rawArtifactPath: string | null = null) {
  return {
    boardId: BOARD,
    storagePath: 'knowledge/board-1/document-1/original.pdf',
    rawArtifactPath,
  };
}

function documentDeps(options: {
  authorized?: boolean;
  deleteResult?: Result<boolean, DomainError>;
  remove?: (path: string) => Promise<Result<void, DomainError>>;
} = {}) {
  const removed: string[] = [];
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
      remove: async (path: string) => {
        events.push(`remove:${path}`);
        removed.push(path);
        return options.remove ? options.remove(path) : ok(undefined);
      },
    },
  };
  return { deps, removed, events };
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
      remove: async (path) =>
        path.endsWith('raw.json')
          ? err(domainError('unavailable', 'Storage unavailable'))
          : ok(undefined),
    });

    const result = await deleteKnowledgeDocument(deps, { documentId: DOCUMENT, userId: OWNER });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.deleted).toBe(true);
    expect(result.value.storageCleanup).toMatchObject({
      status: 'partial',
      failedPaths: ['knowledge/board-1/document-1/raw.json'],
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
              { storagePath: 'doc-a/original.pdf', rawArtifactPath: null },
              { storagePath: 'doc-b/original.pdf', rawArtifactPath: 'doc-b/raw.json' },
            ]);
          },
          deleteBoard: async () => {
            events.push('delete-board');
            return ok(true);
          },
        },
        storage: {
          remove: async (path: string) => {
            events.push(`remove:${path}`);
            removed.push(path);
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
            ok([{ storagePath: 'doc/original.pdf', rawArtifactPath: null }]),
          deleteBoard: async () => err(domainError('unavailable', 'database unavailable')),
        },
        storage: {
          remove: async (path: string) => {
            removed.push(path);
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
    const removed: string[] = [];
    const result = await cleanupKnowledgeArtifacts(
      {
        remove: async (path) => {
          removed.push(path);
          return path === 'bad' ? err(domainError('unavailable', 'failed')) : ok(undefined);
        },
      },
      [
        { storagePath: 'good', rawArtifactPath: null },
        { storagePath: 'bad', rawArtifactPath: 'good' },
      ],
    );

    expect(result.status).toBe('partial');
    expect(removed).toEqual(['good', 'bad']);
  });
});
