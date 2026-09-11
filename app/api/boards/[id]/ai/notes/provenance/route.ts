import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createCreateKnowledgeSourceReferenceCommand } from '@/lib/domain/knowledge/knowledgeSourceReferenceWrite';
import {
  SupabaseKnowledgeSourceReferenceValidationRepository,
  SupabaseKnowledgeSourceReferenceWriteAuthorizer,
  SupabaseKnowledgeSourceReferenceWriter,
  nodeKnowledgeQuoteHasher,
} from '@/lib/infra/knowledge/knowledgeSourceReferenceWriteAdapters';
import type { KnowledgeSourceReferenceWriteSupabaseClient } from '@/lib/infra/knowledge/knowledgeSourceReferenceWriteAdapters';
import { resolveProvenNoteReferences } from '@/lib/server/ai/boardAiNoteProvenance';

export const runtime = 'nodejs';

/**
 * Attaches an AI answer's PROVEN provenance to a Note the client just created.
 *
 * The request names the assistant message and the Note. It deliberately cannot
 * name a source: there is no document, page, offset or quote parameter, so a
 * browser has nothing to say about what the answer cited. Everything is
 * recovered from the stored, signed assistant row and from authoritative page
 * text, and each reference is written through the SAME command every other
 * source reference goes through -- which re-authorizes the board and re-checks
 * the quote against the page itself.
 *
 * An answer with no proven citations is a success with zero references: the
 * Note is simply unsourced. A forged, unsigned or tampered row is a 403 -- the
 * caller rolls the Note back rather than keeping one that claims a source it
 * cannot prove.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: boardId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const payload = body as Record<string, unknown>;

  // Strictly two fields. A caller that tries to supply provenance is refused
  // outright rather than having it quietly ignored -- silence would invite a
  // future reader to assume it was honoured.
  const allowed = new Set(['messageId', 'targetPadletId']);
  if (Object.keys(payload).some((key) => !allowed.has(key))) {
    return NextResponse.json(
      { error: 'Provenance is resolved server-side and must not be supplied.' },
      { status: 400 },
    );
  }
  const messageId = typeof payload.messageId === 'string' ? payload.messageId : null;
  const targetPadletId = typeof payload.targetPadletId === 'string' ? payload.targetPadletId : null;
  if (!messageId || !targetPadletId) {
    return NextResponse.json({ error: 'messageId and targetPadletId are required.' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({
    cookies: () => cookieStore as unknown as ReturnType<typeof cookies>,
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Read through the authenticated client, so the user's own RLS decides what
  // they can see. Deliberately NOT an admin client.
  const { data: row } = await supabase
    .from('board_ai_messages')
    .select('id, thread_id, role, content, citations, board_ai_threads!inner(board_id, user_id)')
    .eq('id', messageId)
    .maybeSingle();

  const thread = (row as { board_ai_threads?: { board_id?: unknown; user_id?: unknown } } | null)
    ?.board_ai_threads;
  // The thread must be this user's, and must belong to the board in the URL:
  // a message from another board cannot lend its provenance to this Note.
  if (!row || !thread || thread.user_id !== user.id || String(thread.board_id) !== boardId) {
    return NextResponse.json({ error: 'Message not found.' }, { status: 404 });
  }

  const stored = row as unknown as {
    id: string; thread_id: string; role: string; content: string; citations: unknown;
  };

  const resolved = await resolveProvenNoteReferences(
    {
      id: stored.id,
      threadId: stored.thread_id,
      boardId,
      role: stored.role,
      content: stored.content,
      citations: stored.citations,
    },
    async (sourceDocumentId, pageNumber) => {
      const { data } = await supabase
        .from('knowledge_pages')
        .select('text')
        .eq('document_id', sourceDocumentId)
        .eq('page_number', pageNumber)
        .maybeSingle();
      const text = (data as { text?: unknown } | null)?.text;
      return typeof text === 'string' ? text : null;
    },
  );

  if (!resolved.ok) {
    return NextResponse.json({ error: 'Provenance could not be verified.', reason: resolved.reason }, { status: 403 });
  }

  // The one source-reference authority, unchanged: it re-authorizes the board
  // as owner/editor and re-slices the page to check the quote.
  const writeClient = supabase as unknown as KnowledgeSourceReferenceWriteSupabaseClient;
  const createSourceReference = createCreateKnowledgeSourceReferenceCommand({
    authorizer: new SupabaseKnowledgeSourceReferenceWriteAuthorizer(writeClient),
    repository: new SupabaseKnowledgeSourceReferenceValidationRepository(writeClient),
    writer: new SupabaseKnowledgeSourceReferenceWriter(writeClient),
    hasher: nodeKnowledgeQuoteHasher,
  });

  for (const reference of resolved.references) {
    const created = await createSourceReference({
      boardId: boardId as never,
      userId: user.id as never,
      targetPadletId: targetPadletId as never,
      sourceDocumentId: reference.sourceDocumentId as never,
      pageStart: reference.pageStart,
      pageEnd: reference.pageEnd,
      quoteText: reference.quoteText,
      charStart: reference.charStart,
      charEnd: reference.charEnd,
      selectedText: reference.selectedText,
      region: null,
      appliedRotation: null,
    });
    if (!created.ok) {
      // Partial provenance is not a Note. The caller deletes it, and the
      // references written so far go with it by the schema's own cascade.
      return NextResponse.json(
        { error: 'Source reference rejected.', code: created.error.code },
        { status: 422 },
      );
    }
  }

  return NextResponse.json({ referenceCount: resolved.references.length });
}
