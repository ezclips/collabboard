import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  knowledgeETagMatches,
  knowledgePagesETag,
  knowledgePagesSummaryETag,
} from '@/lib/domain/knowledge/knowledgePdfRenderPolicy';
import { KNOWLEDGE_TEXT_CARD_EXCERPT_CHARS } from '@/lib/domain/knowledge/knowledgeTextCardExcerpt';
import { safeTextCutIndex } from '@/lib/domain/knowledge/knowledgeTextCanonical';

/** Private, and revalidated every time, so authorization never goes stale. */
const PAGES_CACHEABLE = 'private, max-age=0, must-revalidate';

export const runtime = 'nodejs';

type ResolvedNextCookieStore = Awaited<ReturnType<typeof cookies>>;

function createKnowledgeRouteClient(cookieStore: ResolvedNextCookieStore) {
  return createRouteHandlerClient({
    // Next 15 cookies() is awaited first; auth-helper runtime requires the resolved synchronous store.
    cookies: () => cookieStore as unknown as ReturnType<typeof cookies>,
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; documentId: string }> },
) {
  try {
    const cookieStore = await cookies();
    const sessionClient = createKnowledgeRouteClient(cookieStore);
    const {
      data: { user },
      error: authError,
    } = await sessionClient.auth.getUser();

    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: boardId, documentId } = await context.params;
    const owner = await sessionClient
      .from('boards')
      .select('id')
      .eq('id', boardId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (owner.error) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });

    let allowed = owner.data !== null;
    if (!allowed) {
      const member = await sessionClient.rpc('is_board_member', {
        board_uuid: boardId,
        user_uuid: user.id,
      });
      if (member.error) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
      allowed = member.data === true;
    }
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const adminClient = getSupabaseAdmin();
    const { data: document, error: documentError } = await adminClient
      .from('knowledge_documents')
      // content_sha256 joins the read the route already performs; the ready
      // page set is derived from exactly those bytes, so it is the validator.
      // `kind` decides what this document HAS: a PDF has pages, a text source
      // has one continuous canonical text. Read from the row, never inferred
      // from an empty page set -- a PDF whose extraction produced nothing
      // would otherwise be served as though it were text.
      .select('id, original_filename, page_count, processing_status, content_sha256, kind, transcript_representation')
      .eq('id', documentId)
      .eq('board_id', boardId)
      .maybeSingle();
    if (documentError) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
    if (!document) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (document.processing_status !== 'ready') {
      return NextResponse.json({ error: 'Knowledge document is not ready' }, { status: 409 });
    }

    /**
     * Revalidated on every request, never blindly reused.
     *
     * The page text is already durable in Postgres; what cost the user time was
     * re-sending it on every reader open. `must-revalidate` keeps the bytes in
     * the browser while forcing this route -- and therefore the authorization
     * above -- to run each time. No durable browser copy of document text is
     * created anywhere.
     */
    /**
     * PATCH-181. The SUMMARY representation: page count, page sizes and a short
     * snippet (or a text source's excerpt), and NO page text. A canvas card
     * needs only these to show one page picture and a page count, so it asks
     * for the summary rather than the text of every page.
     *
     * A DIFFERENT representation with a DIFFERENT validator, deliberately: the
     * same bytes under one ETag would let a browser holding the full body answer
     * 304 to a summary request and be handed the wrong shape.
     */
    const isSummary = new URL(request.url).searchParams.get('view') === 'summary';

    const etag = typeof document.content_sha256 === 'string'
      ? (isSummary ? knowledgePagesSummaryETag : knowledgePagesETag)(
        document.content_sha256,
        typeof document.page_count === 'number' ? document.page_count : null,
      )
      : null;
    if (etag !== null && knowledgeETagMatches(request.headers.get('if-none-match'), etag)) {
      // Authorization already ran; a 304 is only ever reached through it.
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: etag, 'Cache-Control': PAGES_CACHEABLE },
      });
    }

    // EACH KNOWN KIND, NAMED. Not "anything that is not a PDF": that reads as
    // two cases and is really a guess, and would serve a kind this build has
    // never heard of as though its chunks were plain text. An unknown kind
    // stops here, exactly as it does in the citation resolver.
    if (document.kind !== 'pdf' && document.kind !== 'text') {
      return NextResponse.json({ error: 'Unsupported source kind' }, { status: 409 });
    }

    // ------------------------------------------------------------------
    // A PAGELESS SOURCE: one canonical text instead of a page list.
    // ------------------------------------------------------------------
    //
    // Served by THIS route rather than a sibling, deliberately. Everything
    // above -- the session, the owner-or-member check, the board-scoped
    // document read, the readiness gate, the content-hash ETag -- is the same
    // for either shape, and a second endpoint would be a second copy of an
    // authorization sequence that must never drift. Only the body differs.
    //
    // The text is the chunks concatenated in index order, which IS the
    // canonical text: the chunker's own invariant is that a chunk's text is
    // exactly source.slice(charStart, charEnd), and that the spans are
    // contiguous and cover the source. So the character offsets a citation
    // carries index into exactly what is returned here.
    if (document.kind === 'text') {
      const { data: chunks, error: chunksError } = await adminClient
        .from('knowledge_chunks')
        .select('chunk_index, char_start, char_end, text')
        .eq('document_id', document.id)
        .is('page_start', null)
        .order('chunk_index', { ascending: true });
      if (chunksError) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });

      const ordered = (chunks ?? []) as { chunk_index: number; char_start: number; char_end: number; text: string }[];
      // CONTIGUITY IS CHECKED, not assumed. A gap means the stored chunks do
      // not reproduce the source, and every offset after that gap would name
      // the wrong characters -- a citation landing a little way from what it
      // quotes is precisely what this stage exists to prevent. Refused as
      // unavailable rather than served as a document that reads correctly and
      // highlights the wrong words.
      let cursor = 0;
      for (const chunk of ordered) {
        if (chunk.char_start !== cursor || chunk.char_end - chunk.char_start !== chunk.text.length) {
          return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
        }
        cursor = chunk.char_end;
      }

      const stitched = ordered.map((chunk) => chunk.text).join('');
      return NextResponse.json(
        {
          document: {
            id: document.id,
            originalFilename: document.original_filename,
            // Null, not zero: this document has no pages, rather than a page
            // count that was measured and found to be none.
            pageCount: null,
            kind: document.kind,
            // WHAT MAKES A TEXT SOURCE A TRANSCRIPT. Null for an
            // ordinary text file, and the reader needs the difference:
            // inferring "transcript" from the absence of pages would
            // attach an unverified-claim notice to a plain .txt.
            transcriptRepresentation: document.transcript_representation ?? null,
          },
          // Empty by construction, and present so one client shape reads both.
          pages: [],
          // Summary serves only the card's excerpt; the full read serves all of
          // it. The cut is SURROGATE-SAFE (never between a character's halves),
          // because a lone half at the end of a pre-cut excerpt renders as a
          // replacement glyph and cannot be repaired downstream.
          text: isSummary
            ? stitched.slice(0, safeTextCutIndex(stitched, KNOWLEDGE_TEXT_CARD_EXCERPT_CHARS))
            : stitched,
          ...(isSummary
            ? { textTruncated: stitched.length > safeTextCutIndex(stitched, KNOWLEDGE_TEXT_CARD_EXCERPT_CHARS) }
            : {}),
          // The FULL stitched length, so a card's footer can state the same
          // character count it always did even though the excerpt is short.
          ...(isSummary ? { textLength: stitched.length } : {}),
        },
        {
          status: 200,
          headers: etag === null
            ? { 'Cache-Control': 'no-store' }
            : { ETag: etag, 'Cache-Control': PAGES_CACHEABLE },
        },
      );
    }

    if (isSummary) {
      // METADATA ONLY: every page's number and persisted geometry, no text.
      const { data: pageMeta, error: pageMetaError } = await adminClient
        .from('knowledge_pages')
        .select('page_number, width_points, height_points, rotation')
        .eq('document_id', document.id)
        .order('page_number', { ascending: true });
      if (pageMetaError) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });

      // The snippet, read in its OWN minimal query: the first page whose text is
      // non-empty. Selecting text here -- one page, ordered then limited -- is
      // what keeps the summary from fetching the text of EVERY page, which is
      // the whole cost this mode removes.
      const { data: snippetRows, error: snippetError } = await adminClient
        .from('knowledge_pages')
        .select('text')
        .eq('document_id', document.id)
        .neq('text', '')
        .order('page_number', { ascending: true })
        .limit(1);
      if (snippetError) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
      const snippetText = (snippetRows ?? [])[0]?.text;
      const snippet = typeof snippetText === 'string' && snippetText.trim().length > 0
        ? snippetText.trim().slice(0, 90)
        : null;

      return NextResponse.json(
        {
          document: {
            id: document.id,
            originalFilename: document.original_filename,
            pageCount: document.page_count,
            kind: document.kind,
          },
          pages: (pageMeta ?? []).map((page: {
            page_number: number;
            width_points: number | null; height_points: number | null; rotation: number | null;
          }) => ({
            pageNumber: page.page_number,
            widthPoints: page.width_points,
            heightPoints: page.height_points,
            rotation: page.rotation,
          })),
          snippet,
        },
        {
          status: 200,
          headers: etag === null
            ? { 'Cache-Control': 'no-store' }
            : { ETag: etag, 'Cache-Control': PAGES_CACHEABLE },
        },
      );
    }

    const { data: pages, error: pagesError } = await adminClient
      .from('knowledge_pages')
      .select('page_number, text, width_points, height_points, rotation')
      .eq('document_id', document.id)
      .order('page_number', { ascending: true });
    if (pagesError) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });

    return NextResponse.json(
      {
        document: {
          id: document.id,
          originalFilename: document.original_filename,
          pageCount: document.page_count,
          kind: document.kind,
        },
        // P6J-F9-A2b: the geometry the worker already persisted, so the reader
        // can reserve each page image's aspect ratio before the derivative loads.
        pages: (pages ?? []).map((page: {
          page_number: number; text: string;
          width_points: number | null; height_points: number | null; rotation: number | null;
        }) => ({
          pageNumber: page.page_number,
          text: page.text,
          widthPoints: page.width_points,
          heightPoints: page.height_points,
          rotation: page.rotation,
        })),
      },
      {
        status: 200,
        headers: etag === null
          ? { 'Cache-Control': 'no-store' }
          : { ETag: etag, 'Cache-Control': PAGES_CACHEABLE },
      },
    );
  } catch {
    return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
  }
}
