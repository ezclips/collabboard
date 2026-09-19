import {
  createBoardWikiReadHandler,
  createBoardWikiSaveHandler,
} from '@/lib/server/wiki/boardWikiPageRoute';
import { getBoardWikiSession } from '@/lib/server/wiki/boardWikiPageSession';

export const runtime = 'nodejs';

/**
 * One wiki page: reading it with its derived source states, and saving it.
 *
 * THERE IS NO HANDLER HERE THAT APPLIES A PROPOSAL. Saving takes text, and by
 * the time text arrives it is text a person accepted -- see the header of
 * lib/server/wiki/boardWikiPageRoute.ts for why the obvious endpoint is absent.
 */
export const GET = createBoardWikiReadHandler({
  getAuthenticatedSession: getBoardWikiSession,
});

export const PATCH = createBoardWikiSaveHandler({
  getAuthenticatedSession: getBoardWikiSession,
});
