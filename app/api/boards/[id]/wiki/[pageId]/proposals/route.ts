import { createBoardWikiCompileHandler } from '@/lib/server/wiki/boardWikiPageRoute';
import { getBoardWikiSession } from '@/lib/server/wiki/boardWikiPageSession';

export const runtime = 'nodejs';

/**
 * Unit 3. Compiling a proposal for one wiki page.
 *
 * POST creates a PROPOSAL, never a page. There is deliberately no handler here
 * or anywhere else that applies one: applying happens in the browser, and the
 * result reaches the server as an ordinary page save of text a person accepted.
 */
export const POST = createBoardWikiCompileHandler({
  getAuthenticatedSession: getBoardWikiSession,
});
