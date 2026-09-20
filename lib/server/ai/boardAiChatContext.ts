// Board AI Chat -- authorizing and resolving explicit context.
//
// SERVER ONLY.
//
// The single rule this module exists to enforce: a context reference is an
// IDENTITY the caller names, never content the caller supplies. Every block
// that reaches a model was read here, on this turn, through the caller's own
// authenticated client, scoped to the route board.
//
// It runs identically for a fresh attachment and for one carried in a stored
// message. That is deliberate. BCHAT-A lets a user write rows in their own
// private thread, so a stored context row is a claim by the same person who
// could have typed anything -- re-resolving from identity is what stops a
// hand-written row from naming a document its author may not read.

import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import {
  BOARD_AI_CONTEXT_IMAGE_MARKER,
  BOARD_AI_CONTEXT_MAX_DOCUMENT_PAGES,
  BOARD_AI_CONTEXT_MAX_SINGLE_CHARS,
  boardAiContextLabel,
  type BoardAiContextRequestItem,
  type ResolvedBoardAiContextBlock,
} from '../../domain/ai/boardAiChatContext';
import {
  KNOWLEDGE_PDF_AREA_IMAGE_CONTENT_TYPE,
  knowledgePdfAreaImagePath,
  parseKnowledgePdfAreaProvenance,
} from '../../domain/knowledge/knowledgePdfAreaImagePolicy';
import {
  stitchKnowledgeTextRange,
  type KnowledgeStoredTextChunk,
} from '../../domain/knowledge/knowledgeTextChunking';

/**
 * The reads this resolver performs, and nothing more. Supplied as the CALLER'S
 * authenticated client, so RLS decides what exists: `knowledge_documents`,
 * `knowledge_pages` and `padlets` each carry their own board-scoped policies,
 * and the explicit board filters below add the route-board rule on top.
 *
 * No admin client is accepted. Reading around RLS to answer "may I read this"
 * would make the answer meaningless.
 */
export interface BoardAiContextSupabaseClient {
  from(table: 'knowledge_documents' | 'knowledge_pages' | 'knowledge_chunks' | 'padlets'): {
    select(columns: string): ContextQuery;
  };
}

interface ContextRow { readonly [key: string]: unknown }

interface ContextQuery extends PromiseLike<{ data: ContextRow[] | null; error: unknown }> {
  eq(column: string, value: unknown): ContextQuery;
  /** Needed for `page_start IS NULL`: a pageless source is selected by it. */
  is(column: string, value: null): ContextQuery;
  in(column: string, values: readonly unknown[]): ContextQuery;
  order(column: string, options: { ascending: boolean }): ContextQuery;
  limit(count: number): ContextQuery;
  maybeSingle(): Promise<{ data: ContextRow | null; error: unknown }>;
}

/**
 * Post types whose text this server can extract safely today.
 *
 * Only the two whose substance genuinely lives in `content` as TipTap HTML.
 * `todo` and `card` were removed after review measured what they actually
 * resolve to: a to-do keeps its tasks in `metadata.tasks`, so it arrived as a
 * bare heading, and `card` is not a text post at all -- it is clipart, or the
 * Document card standing in for a PDF, and arrived as a filename. Both were
 * accepted with a 200, which is worse than refusing: the user believes they
 * attached a list or a document, and the model answers from a title.
 *
 * Extraction for those types is a product decision, not a widening of this
 * set. Nothing here may be added without a defined text authority.
 */
const SUPPORTED_PADLET_TYPES = new Set(['text', 'note']);

/**
 * The raw size an attached crop may reach, in BYTES.
 *
 * Applied to the bytes rather than to the base64, because base64 inflates by
 * ~4/3 and the meaningful limit is what the object actually is. Five megabytes
 * of WebP is far larger than any page-region crop this product produces, so
 * this is a backstop against a pathological object rather than a working
 * budget.
 *
 * REFUSE, never truncate. Half an image is not a smaller image -- it is a
 * corrupt one, and a model handed corrupt bytes either errors or, worse,
 * describes whatever it made of the fragment.
 */
export const BOARD_AI_CONTEXT_MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * The privileged byte read, and ONLY the byte read.
 *
 * Authorisation never comes from here. By the time this is called the caller's
 * OWN client has already proved the padlet exists on the route board and that
 * its metadata really is PDF-area provenance; this only fetches an object at a
 * path the server derived itself. Keeping the two apart is what preserves this
 * module's standing rule -- "no admin client is accepted", because reading
 * around RLS to answer "may I read this" would make the answer meaningless.
 * Reading bytes AFTER the answer is yes is a different question.
 */
export interface BoardAiContextByteReader {
  download(path: string): Promise<Result<{ bytes: Uint8Array }, DomainError>>;
}

/**
 * TipTap bodies are HTML. Tags are stripped and entities decoded so the model
 * receives the words a person sees -- never markup, and never anything a
 * renderer could execute. Nothing downstream re-parses this as HTML.
 */
function plainTextFromPostContent(content: string): string {
  return content
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const bounded = (text: string): string =>
  text.length <= BOARD_AI_CONTEXT_MAX_SINGLE_CHARS
    ? text
    : `${text.slice(0, BOARD_AI_CONTEXT_MAX_SINGLE_CHARS - 1)}…`;

/**
 * The document, proven to sit on THIS board.
 *
 * `.eq('board_id', boardId)` is the rule that keeps Board Chat scoped: a user
 * who can read two boards still cannot pull board Y's PDF into board X's
 * conversation, because the row simply is not there for this query.
 */
async function readDocument(
  client: BoardAiContextSupabaseClient,
  boardId: string,
  documentId: string,
): Promise<Result<{ filename: string; ready: boolean; kind: string } | null, DomainError>> {
  const { data, error } = await client
    .from('knowledge_documents')
    .select('id, original_filename, processing_status, kind')
    .eq('id', documentId)
    .eq('board_id', boardId)
    .maybeSingle();
  if (error) return err(domainError('unavailable', 'Could not read the source document'));
  if (!data) return ok(null);
  return ok({
    // 'Document', not 'PDF': this is the display name of ANY source kind.
    filename: typeof data.original_filename === 'string' ? data.original_filename : 'Document',
    // Only a finished document has persisted pages. Chat never starts one.
    ready: data.processing_status === 'ready',
    // WHAT THIS SOURCE IS, taken from the AUTHORIZED record and from nowhere
    // else. Never inferred from a null page, never from the retrieval origin:
    // both of those are consequences of the kind, and reading a consequence
    // backwards is how a malformed request gets to pick its own code path.
    kind: typeof data.kind === 'string' ? data.kind : 'pdf',
  });
}

async function readPages(
  client: BoardAiContextSupabaseClient,
  documentId: string,
  pageNumber: number | null,
  limit: number,
): Promise<Result<{ pageNumber: number; text: string }[], DomainError>> {
  let query = client
    .from('knowledge_pages')
    .select('page_number, text')
    .eq('document_id', documentId);
  if (pageNumber !== null) query = query.eq('page_number', pageNumber);
  const { data, error } = await query.order('page_number', { ascending: true }).limit(limit);
  if (error) return err(domainError('unavailable', 'Could not read the source pages'));
  return ok((data ?? []).map((row) => ({
    pageNumber: Number(row.page_number),
    text: typeof row.text === 'string' ? row.text : '',
  })));
}

/**
 * The chunks of a PAGELESS source, in order.
 *
 * Stage 1 decision (A): for a source with no pages the CHUNKS ARE THE
 * CANONICAL TEXT -- there is no knowledge_pages row to slice, and creating a
 * synthetic page 1 to make the existing path work would put a locator in the
 * database that says something untrue about the source.
 *
 * Contiguity and losslessness are asserted at INGEST, so the rows read here
 * concatenate back to exactly the text the offsets were computed against.
 * stitchKnowledgeTextRange re-checks that on the way out anyway, and returns
 * nothing rather than a fragment if a row is missing.
 */
async function readTextChunks(
  client: BoardAiContextSupabaseClient,
  documentId: string,
): Promise<Result<KnowledgeStoredTextChunk[], DomainError>> {
  const { data, error } = await client
    .from('knowledge_chunks')
    .select('text, char_start, char_end, chunk_index')
    .eq('document_id', documentId)
    .is('page_start', null)
    .order('chunk_index', { ascending: true });
  if (error) return err(domainError('unavailable', 'Could not read the source text'));
  return ok((data ?? [])
    .filter((row) => typeof row.text === 'string' && row.char_start !== null && row.char_end !== null)
    .map((row) => ({
      text: String(row.text),
      charStart: Number(row.char_start),
      charEnd: Number(row.char_end),
      chunkIndex: Number(row.chunk_index),
    })));
}

/**
 * Resolve one reference, or refuse it.
 *
 * `not_found` is returned for every refusal a caller could use to probe: a
 * document on another board, a page that does not exist and a post the caller
 * cannot see are indistinguishable in the answer, exactly as the Knowledge
 * routes already behave.
 */
async function resolveOne(
  client: BoardAiContextSupabaseClient,
  boardId: string,
  item: BoardAiContextRequestItem,
  byteReader: BoardAiContextByteReader,
): Promise<Result<ResolvedBoardAiContextBlock, DomainError>> {
  if (item.type === 'padlet-image') {
    // Step 1. The CALLER'S client, board-scoped. Nothing privileged has run
    // yet: if this row is not visible to this user on this board, the answer is
    // `not_found` and no byte is fetched.
    const { data, error } = await client
      .from('padlets')
      .select('id, type, title, metadata')
      .eq('id', item.padletId)
      .eq('board_id', boardId)
      .maybeSingle();
    if (error) return err(domainError('unavailable', 'Could not read the post'));
    if (!data) return err(domainError('not_found', 'Context is not available on this board'));

    // Step 2. A crop is the ONLY thing this type may resolve. The same parser
    // the image route uses as its authorisation gate: a card whose metadata
    // does not parse here is not an area image, so naming an ordinary image
    // post as `padlet-image` cannot make it attachable. Without this, the type
    // would be a request to fetch any object the path formula can address.
    const provenance = parseKnowledgePdfAreaProvenance(data.metadata);
    if (provenance === null) {
      return err(domainError('validation', 'This post type cannot be used as context'));
    }

    // Step 3. The path is DERIVED from two validated ids and is never read from
    // metadata -- mirroring knowledgePdfAreaImageRoute exactly. A hostile
    // `storagePath` or `imageUrl` on the card is simply never consulted, which
    // is why it cannot point this read anywhere.
    const path = knowledgePdfAreaImagePath(boardId, item.padletId);
    if (path === null) return err(domainError('validation', 'This post cannot be used as context'));

    // Step 4. Only now, and only bytes.
    const download = await byteReader.download(path);
    if (!download.ok) return err(domainError('unavailable', 'Could not read the attached image'));

    // Step 5. Budget on the raw bytes, and refuse rather than truncate.
    const { bytes } = download.value;
    if (bytes.byteLength > BOARD_AI_CONTEXT_MAX_IMAGE_BYTES) {
      return err(domainError('validation', 'This image is too large to attach'));
    }

    const title = typeof data.title === 'string' ? data.title.trim() : '';
    return ok({
      type: 'padlet-image',
      padletId: item.padletId,
      // The document and page the crop came from travel with it, so a citation
      // can say which page an answer leaned on -- the same identity every other
      // block carries, read from provenance rather than re-derived.
      knowledgeDocumentId: provenance.knowledgeDocumentId,
      pageNumber: provenance.pageNumber,
      label: boardAiContextLabel(title.length > 0 ? title : 'PDF area'),
      // The marker, never the bytes. Everything that serializes a block reads
      // `text`; the payload below is read only by the execution layer.
      text: BOARD_AI_CONTEXT_IMAGE_MARKER,
      image: {
        mediaType: KNOWLEDGE_PDF_AREA_IMAGE_CONTENT_TYPE,
        base64: Buffer.from(bytes).toString('base64'),
      },
    });
  }

  if (item.type === 'board-search') {
    // NOT RESOLVABLE FROM AN IDENTITY, and that is the point. A search is
    // performed once, by boardAiChatSearch, on the turn the user asked for it.
    // Reaching here means a stored search item was fed back into resolution --
    // which would re-run a days-old query against today's board and drop
    // passages nobody asked for into an unrelated answer. The historical path
    // filters these out before this point; this refuses, so a future caller
    // that forgets cannot silently get a second search instead of an error.
    return err(domainError('validation', 'A board search cannot be resolved as a source'));
  }

  if (item.type === 'padlet') {
    const { data, error } = await client
      .from('padlets')
      .select('id, type, title, content')
      .eq('id', item.padletId)
      .eq('board_id', boardId)
      .maybeSingle();
    if (error) return err(domainError('unavailable', 'Could not read the post'));
    if (!data) return err(domainError('not_found', 'Context is not available on this board'));
    const type = String(data.type ?? '');
    if (!SUPPORTED_PADLET_TYPES.has(type)) {
      // Images, drawings, files and embeds have no safe text authority here.
      return err(domainError('validation', 'This post type cannot be used as context'));
    }
    const title = typeof data.title === 'string' ? data.title.trim() : '';
    const text = plainTextFromPostContent(typeof data.content === 'string' ? data.content : '');
    if (text.length === 0 && title.length === 0) {
      return err(domainError('not_found', 'Context is not available on this board'));
    }
    return ok({
      type: 'padlet',
      padletId: item.padletId,
      label: boardAiContextLabel(title.length > 0 ? title : 'Note'),
      text: bounded(title.length > 0 ? `${title}\n\n${text}` : text),
    });
  }

  const document = await readDocument(client, boardId, item.knowledgeDocumentId);
  if (!document.ok) return err(document.error);
  if (document.value === null) {
    return err(domainError('not_found', 'Context is not available on this board'));
  }
  if (!document.value.ready) {
    // Truthful, and it never becomes a reason to start extraction: Chat reads
    // what the worker already persisted or it reads nothing.
    return err(domainError('conflict', 'This source is not ready to be used as context'));
  }
  const label = boardAiContextLabel(document.value.filename);

  if (item.type === 'knowledge-document') {
    const pages = await readPages(client, item.knowledgeDocumentId, null, BOARD_AI_CONTEXT_MAX_DOCUMENT_PAGES);
    if (!pages.ok) return err(pages.error);
    if (pages.value.length === 0) {
      // A pageless source: the chunks are the text. Not an error -- every text
      // and markdown source reaches this branch.
      const chunks = await readTextChunks(client, item.knowledgeDocumentId);
      if (!chunks.ok) return err(chunks.error);
      if (chunks.value.length === 0) {
        return err(domainError('not_found', 'Context is not available on this board'));
      }
      return ok({
        type: 'knowledge-document',
        knowledgeDocumentId: item.knowledgeDocumentId,
        label,
        // No pages to enumerate. Board search reads pageNumbers to avoid
        // sending the same page twice; an empty list means it has nothing to
        // exclude, which is correct -- a pageless source has no page identity
        // to collide on.
        pageNumbers: [],
        text: bounded(chunks.value.map((chunk) => chunk.text).join('')),
      });
    }
    // Page identity survives into the text so a later citation slice can tell
    // which page an answer leaned on -- never one provenance-less blob.
    const text = pages.value
      .map((page) => `[page ${page.pageNumber}]\n${page.text}`)
      .join('\n\n');
    return ok({
      type: 'knowledge-document',
      knowledgeDocumentId: item.knowledgeDocumentId,
      label,
      // WHICH pages, not how many. The read is capped at
      // BOARD_AI_CONTEXT_MAX_DOCUMENT_PAGES, so a document attachment covers a
      // PREFIX of the document and nothing beyond it. Board search reads this to
      // avoid sending the same page twice while still returning passages from
      // the pages this attachment never reached.
      pageNumbers: pages.value.map((page) => page.pageNumber),
      text: bounded(text),
    });
  }

  // ===========================================================================
  // THE LOCATOR IS VALIDATED AGAINST THE DOCUMENT'S KIND, EXPLICITLY
  // ===========================================================================
  //
  // The kind comes from the AUTHORIZED record read above. An earlier version
  // of this branched on `pageNumber === undefined`, which let the REQUEST
  // choose its own code path: omit the page and the pageless reader runs. That
  // is the shape of defect this module exists to refuse -- a caller naming an
  // identity is fine, a caller selecting a resolution strategy is not.
  //
  // So each kind states what a locator for it must look like, and anything
  // else is a validation failure with a reason rather than a quiet fallback.
  const pageless = document.value.kind !== 'pdf';

  if (pageless && item.pageNumber !== undefined) {
    return err(domainError('validation', 'This source has no pages, so a page cannot be cited in it'));
  }
  if (!pageless && item.pageNumber === undefined) {
    return err(domainError('validation', 'A page is required to cite this source'));
  }

  const pages = pageless
    ? ok([] as { pageNumber: number; text: string }[])
    : await readPages(client, item.knowledgeDocumentId, item.pageNumber ?? null, 1);
  if (!pages.ok) return err(pages.error);
  const page = pages.value[0];

  if (!page) {
    // A pageless source. Only a SELECTION can be resolved here: a
    // knowledge-PAGE reference to a source that has no pages names something
    // that does not exist, and inventing page 1 for it would hand the reader a
    // locator the document never had.
    if (item.type !== 'knowledge-selection') {
      return err(domainError('not_found', 'Context is not available on this board'));
    }
    if (!Number.isInteger(item.charStart) || !Number.isInteger(item.charEnd)
        || item.charStart < 0 || item.charEnd <= item.charStart) {
      return err(domainError('validation', 'That selection range is not valid'));
    }
    const chunks = await readTextChunks(client, item.knowledgeDocumentId);
    if (!chunks.ok) return err(chunks.error);

    const canonical = stitchKnowledgeTextRange(chunks.value, item.charStart, item.charEnd);
    // THE SAME CHECK THE PAGED PATH MAKES, for the same reason: the client's
    // string only answers "did we select the same characters?". Our stored
    // text is what is kept. A range the chunks do not fully cover stitches to
    // null and is refused rather than quoted short.
    if (canonical === null || canonical.length === 0 || canonical !== item.selectedText) {
      return err(domainError('validation', 'Selection does not match the stored source text'));
    }
    return ok({
      type: 'knowledge-selection',
      knowledgeDocumentId: item.knowledgeDocumentId,
      charStart: item.charStart,
      charEnd: item.charEnd,
      // KIND-AWARE LABEL: no page to name, so none is named. The search side
      // already did this (chunkLabel drops the page when it is null); this is
      // the context side catching up, which is the decision in the brief.
      label,
      text: bounded(canonical),
    });
  }

  if (item.type === 'knowledge-page') {
    return ok({
      type: 'knowledge-page',
      knowledgeDocumentId: item.knowledgeDocumentId,
      pageNumber: page.pageNumber,
      // The whole page went, so the whole page is covered for de-duplication.
      pageNumbers: [page.pageNumber],
      label: `${label} — page ${page.pageNumber}`,
      text: bounded(page.text),
    });
  }

  // knowledge-selection. The same check the source-reference write command
  // performs: slice OUR page, compare, and keep OUR slice. The client's string
  // only answers "did we select the same characters?".
  if (item.charEnd > page.text.length) {
    return err(domainError('validation', 'Selection does not match the stored source text'));
  }
  const canonical = page.text.slice(item.charStart, item.charEnd);
  if (canonical.length === 0 || canonical !== item.selectedText) {
    return err(domainError('validation', 'Selection does not match the stored source text'));
  }
  return ok({
    type: 'knowledge-selection',
    knowledgeDocumentId: item.knowledgeDocumentId,
    pageNumber: page.pageNumber,
    charStart: item.charStart,
    charEnd: item.charEnd,
    label: `${label} — page ${page.pageNumber}`,
    text: bounded(canonical),
  });
}

/**
 * The caller's CURRENT attachments. Fails closed: one bad reference refuses
 * the whole request, before a thread exists or a message is written, so a
 * rejected attachment leaves nothing behind.
 */
export async function resolveBoardAiChatContext(
  client: BoardAiContextSupabaseClient,
  boardId: string,
  items: readonly BoardAiContextRequestItem[],
  byteReader: BoardAiContextByteReader,
): Promise<Result<readonly ResolvedBoardAiContextBlock[], DomainError>> {
  const blocks: ResolvedBoardAiContextBlock[] = [];
  for (const item of items) {
    const resolved = await resolveOne(client, boardId, item, byteReader);
    if (!resolved.ok) return err(resolved.error);
    blocks.push(resolved.value);
  }
  return ok(blocks);
}

/**
 * A byte reader for paths that are never reached. Historical resolution drops
 * image items before resolveOne sees them, so this stands in the one place a
 * reader is structurally required but semantically absent -- calling it would
 * be the bug, so it fails rather than returning empty bytes.
 */
const NEVER_READS_BYTES: BoardAiContextByteReader = {
  download: async () => err(domainError('unavailable', 'Images are not re-read from history')),
};

/**
 * Context carried in earlier messages, re-proved on this turn.
 *
 * Anything that no longer resolves is DROPPED rather than refused: a source
 * removed from the board, a post deleted, access revoked, or a row the user
 * forged by hand should stop reaching the model without making the rest of
 * their conversation unusable. Nothing here can widen access, because every
 * block still comes from a read this same caller was allowed to perform.
 */
export async function resolveHistoricalBoardAiChatContext(
  client: BoardAiContextSupabaseClient,
  boardId: string,
  items: readonly BoardAiContextRequestItem[],
): Promise<readonly ResolvedBoardAiContextBlock[]> {
  const blocks: ResolvedBoardAiContextBlock[] = [];
  for (const item of items) {
    // Images are current-message-only. Re-resolving a stored image would
    // re-read private bytes on a later turn, and the provider rejects images
    // outside the user message -- replaying one is a 400, not a courtesy.
    // The stored block survives for the chip; the bytes are never re-sent.
    //
    // The filter lives HERE, at the historical boundary, rather than inside
    // resolveOne: resolveOne's job is "resolve this identity", and it is the
    // same function the current path depends on. The rule is about WHEN a
    // reference may be resolved, so it belongs where that distinction exists.
    if (item.type === 'padlet-image') continue;
    // A stored search is a RECORD of one, never a standing instruction. Its
    // query was built from a message asked on some earlier turn; re-running it
    // now would answer a question nobody is asking, and would make the database
    // work grow with thread length -- the very thing the identity cap prevents.
    // The stored item survives for its chip, which is all it was ever for.
    if (item.type === 'board-search') continue;
    const resolved = await resolveOne(client, boardId, item, NEVER_READS_BYTES);
    if (resolved.ok) blocks.push(resolved.value);
  }
  return blocks;
}
