import { NextResponse } from 'next/server';
import {
  createBoardWikiAnswerProposalHandler,
  createBoardWikiCompileHandler,
} from '@/lib/server/wiki/boardWikiPageRoute';
import { getBoardWikiSession } from '@/lib/server/wiki/boardWikiPageSession';

export const runtime = 'nodejs';

/**
 * Creating a PROPOSAL for one wiki page.
 *
 * TWO SOURCES, ONE ENDPOINT, DISPATCHED ON THE BODY:
 *
 *   { topic }          -- a compilation (Unit 3): a model reads the board and
 *                         proposes a page.
 *   { fromMessageId }  -- PATCH-197 "Save to wiki": a stored Board AI answer,
 *                         whose provenance the server verifies itself.
 *
 * EXACTLY ONE OF THE TWO, otherwise 400. There is deliberately no handler here
 * or anywhere else that applies a proposal: applying happens in the browser,
 * and the result reaches the server as an ordinary page save of text a person
 * accepted.
 */

const compile = createBoardWikiCompileHandler({ getAuthenticatedSession: getBoardWikiSession });
const fromAnswer = createBoardWikiAnswerProposalHandler({ getAuthenticatedSession: getBoardWikiSession });

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; pageId: string }> },
): Promise<NextResponse> {
  // The body is read ONCE, here, so the two paths share one parse and the
  // "exactly one of the two" rule is decided in a single place rather than in
  // both handlers.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const hasTopic = typeof (body as { topic?: unknown })?.topic === 'string';
  const hasMessage = typeof (body as { fromMessageId?: unknown })?.fromMessageId === 'string';
  if (hasTopic === hasMessage) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // The handlers re-read the body; the platform hands the request through
  // unchanged, and `request.json()` is idempotent enough for a single call in
  // practice. To avoid relying on that, hand each path a fresh Request built
  // from the already-parsed body.
  const replayed = new Request(request.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  return hasTopic ? compile(replayed, context) : fromAnswer(replayed, context);
}
