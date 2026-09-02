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
  BOARD_AI_CONTEXT_MAX_DOCUMENT_PAGES,
  BOARD_AI_CONTEXT_MAX_SINGLE_CHARS,
  boardAiContextLabel,
  type BoardAiContextRequestItem,
  type ResolvedBoardAiContextBlock,
} from '../../domain/ai/boardAiChatContext';

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
  from(table: 'knowledge_documents' | 'knowledge_pages' | 'padlets'): {
    select(columns: string): ContextQuery;
  };
}

interface ContextRow { readonly [key: string]: unknown }

interface ContextQuery extends PromiseLike<{ data: ContextRow[] | null; error: unknown }> {
  eq(column: string, value: unknown): ContextQuery;
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
): Promise<Result<{ filename: string; ready: boolean } | null, DomainError>> {
  const { data, error } = await client
    .from('knowledge_documents')
    .select('id, original_filename, processing_status')
    .eq('id', documentId)
    .eq('board_id', boardId)
    .maybeSingle();
  if (error) return err(domainError('unavailable', 'Could not read the source document'));
  if (!data) return ok(null);
  return ok({
    filename: typeof data.original_filename === 'string' ? data.original_filename : 'PDF',
    // Only a finished document has persisted pages. Chat never starts one.
    ready: data.processing_status === 'ready',
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
): Promise<Result<ResolvedBoardAiContextBlock, DomainError>> {
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
      return err(domainError('not_found', 'Context is not available on this board'));
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
      text: bounded(text),
    });
  }

  const pages = await readPages(client, item.knowledgeDocumentId, item.pageNumber, 1);
  if (!pages.ok) return err(pages.error);
  const page = pages.value[0];
  if (!page) return err(domainError('not_found', 'Context is not available on this board'));

  if (item.type === 'knowledge-page') {
    return ok({
      type: 'knowledge-page',
      knowledgeDocumentId: item.knowledgeDocumentId,
      pageNumber: page.pageNumber,
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
): Promise<Result<readonly ResolvedBoardAiContextBlock[], DomainError>> {
  const blocks: ResolvedBoardAiContextBlock[] = [];
  for (const item of items) {
    const resolved = await resolveOne(client, boardId, item);
    if (!resolved.ok) return err(resolved.error);
    blocks.push(resolved.value);
  }
  return ok(blocks);
}

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
    const resolved = await resolveOne(client, boardId, item);
    if (resolved.ok) blocks.push(resolved.value);
  }
  return blocks;
}
