import { describe, expect, it, vi } from 'vitest';

import { domainError } from '../../domain/core/errors';
import { err, ok } from '../../domain/core/result';
import type { BoardTranscriptIndexEntry } from '../../domain/knowledge/boardTranscriptIndex';
import { createKnowledgeTranscriptIndexGetHandler } from './knowledgeTranscriptIndexRoute';

const context = { params: Promise.resolve({ id: 'board-1' }) };

const entry: BoardTranscriptIndexEntry = {
  documentId: 'doc-1',
  title: 'A talk',
  videoIdentity: 'yt:dQw4w9WgXcQ',
  format: 'youtube-panel',
  processingStatus: 'ready',
  updatedAt: '2026-09-22T10:00:00.000Z',
};

const handlerWith = (over: {
  session?: unknown;
  list?: () => Promise<unknown>;
} = {}) =>
  createKnowledgeTranscriptIndexGetHandler({
    getAuthenticatedSession: async () =>
      (over.session === undefined
        ? { canViewBoard: async () => true }
        : over.session) as never,
    createRepository: () =>
      ({
        listTranscriptsByBoardId: over.list ?? (async () => ok([entry])),
      }) as never,
  });

describe('the board transcript index route', () => {
  it('returns the board’s transcripts to a reader', async () => {
    const response = await handlerWith()(new Request('http://x'), context);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ transcripts: [entry] });
  });

  it('refuses an unauthenticated caller', async () => {
    const response = await handlerWith({ session: null })(new Request('http://x'), context);
    expect(response.status).toBe(401);
  });

  it('refuses a caller who cannot view the board', async () => {
    const response = await handlerWith({
      session: { canViewBoard: async () => false },
    })(new Request('http://x'), context);
    expect(response.status).toBe(403);
  });

  it('VIEWER PERMISSION IS ENOUGH, matching the document list beside it', async () => {
    // Requiring edit permission would show a viewer "Add transcript" on a card
    // whose transcript already exists -- an action they cannot take, for a
    // thing already done.
    const canViewBoard = vi.fn(async () => true);
    const response = await handlerWith({ session: { canViewBoard } })(
      new Request('http://x'),
      context,
    );
    expect(response.status).toBe(200);
    expect(canViewBoard).toHaveBeenCalledOnce();
  });

  describe('a failure is never reported as an empty board', () => {
    // The shape recorded three times in LESSONS_LEARNED. If any of these
    // returned 200 with [], every card on the board would say "Add transcript"
    // -- a confident claim that none of these videos has a transcript, made at
    // the moment we could not know.
    it('reports 503 when the read is unavailable', async () => {
      const response = await handlerWith({
        list: async () => err(domainError('unavailable', 'nope')),
      })(new Request('http://x'), context);
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.not.toHaveProperty('transcripts');
    });

    it('reports 500 for any other domain error', async () => {
      const response = await handlerWith({
        list: async () => err(domainError('unknown', 'nope')),
      })(new Request('http://x'), context);
      expect(response.status).toBe(500);
    });

    it('reports 503 when the repository throws outright', async () => {
      const response = await handlerWith({
        list: async () => {
          throw new Error('boom');
        },
      })(new Request('http://x'), context);
      expect(response.status).toBe(503);
    });

    it('reports 503 -- NOT 403 -- when the permission check itself throws', async () => {
      // A check that threw did not say "no". It said nothing, and 403 would
      // tell the reader something false about their own access.
      const response = await handlerWith({
        session: {
          canViewBoard: async () => {
            throw new Error('boom');
          },
        },
      })(new Request('http://x'), context);
      expect(response.status).toBe(503);
    });

    it('reports 401 when resolving the session throws', async () => {
      const handler = createKnowledgeTranscriptIndexGetHandler({
        getAuthenticatedSession: async () => {
          throw new Error('boom');
        },
        createRepository: () => ({ listTranscriptsByBoardId: async () => ok([]) }) as never,
      });
      const response = await handler(new Request('http://x'), context);
      expect(response.status).toBe(401);
    });
  });

  it('returns an empty list as a real answer when the board genuinely has none', async () => {
    // The other side of the same coin: [] with a 200 must still be possible,
    // or a board with no transcripts could never show "Add transcript".
    const response = await handlerWith({ list: async () => ok([]) })(
      new Request('http://x'),
      context,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ transcripts: [] });
  });
});
