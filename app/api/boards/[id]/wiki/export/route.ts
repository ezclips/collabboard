import { createBoardWikiExportHandler } from '@/lib/server/wiki/boardWikiPageRoute';
import { getBoardWikiSession } from '@/lib/server/wiki/boardWikiPageSession';

export const runtime = 'nodejs';

/**
 * The board's wiki as an Open Knowledge Format bundle.
 *
 * Its own segment rather than a query parameter on the list route, so that a
 * read of the page list and a read of the whole corpus are distinguishable in
 * a log and in a rate limit -- an export is cheap per call and expensive per
 * board.
 *
 * The SAME session factory as every other wiki route, for the reason that file
 * states: the authority behind an export must not be able to diverge from the
 * authority behind a page read, because the bytes are the same bytes.
 */
export const GET = createBoardWikiExportHandler({
  getAuthenticatedSession: getBoardWikiSession,
});
