import {
  createBoardWikiCreateHandler,
  createBoardWikiListHandler,
} from '@/lib/server/wiki/boardWikiPageRoute';
import { getBoardWikiSession } from '@/lib/server/wiki/boardWikiPageSession';

export const runtime = 'nodejs';

/**
 * The board's wiki: listing its pages and creating one.
 *
 * The session factory lives in lib/server because a Next route module may
 * export only its handlers and route config, and both this route and the page
 * route bind the SAME factory so their authority can never diverge.
 */
export const GET = createBoardWikiListHandler({
  getAuthenticatedSession: getBoardWikiSession,
});

export const POST = createBoardWikiCreateHandler({
  getAuthenticatedSession: getBoardWikiSession,
});
