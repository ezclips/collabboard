// PATCH-371. Padlet-style boards (Wall, Columns, Grid, Timeline, Map) as Board AI
// context.
//
// SERVER ONLY. Reads `boards`, `board_sections` and `padlets` through the
// CALLER'S authenticated client, scoped to the route board, after the same
// board-read authorization the other sources use. No admin client is accepted.
//
// The overview is one block: one line per post, grouped into the board's own
// panels, each post carrying a sub-token (`S2.5`) the citation layer reads back.
// A citation says WHERE (post id + label), never WHAT.

import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import {
  BOARD_AI_CONTEXT_MAX_SINGLE_CHARS,
  boardAiContextLabel,
  type BoardAiCitablePassage,
  type ResolvedBoardAiContextBlock,
} from '../../domain/ai/boardAiChatContext';

/** The layouts this overview exists for. Any other layout resolves to nothing. */
export const PADLET_BOARD_LAYOUTS: readonly string[] = ['wall', 'columns', 'grid', 'timeline', 'map'];

export interface BoardAiPadletBoardQuery extends PromiseLike<{
  data: Array<Record<string, unknown>> | null;
  error: unknown;
}> {
  eq(column: string, value: unknown): BoardAiPadletBoardQuery;
  order(column: string, options: { ascending: boolean }): BoardAiPadletBoardQuery;
  maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: unknown }>;
}

export interface BoardAiPadletBoardSupabaseClient {
  from(table: string): { select(columns: string): BoardAiPadletBoardQuery };
}

/** A hard cap on posts rendered, independent of the character budget. */
export const BOARD_AI_PADLET_BOARD_MAX_POSTS = 300;
/** Per-post body text, so one long Note cannot crowd out the overview. */
const POST_TEXT_MAX = 200;
/** How many words of a title-less post's text become its label. */
const POST_TITLE_WORDS = 6;
const MAX_DEPTH = 3;

const bounded = (value: string): string =>
  value.length <= BOARD_AI_CONTEXT_MAX_SINGLE_CHARS
    ? value
    : `${value.slice(0, BOARD_AI_CONTEXT_MAX_SINGLE_CHARS - 1)}…`;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * An id as text. `board_sections.id` is a BIGINT live (e.g. 197), so `text()`
 * would return '' and no post would ever match its section; the app compares
 * them loosely (`pSectionId == section.id`) and stores `metadata.sectionId` as
 * a STRING. Both sides are normalised to a string here.
 */
function idText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function numberOf(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Strip tags/entities and collapse whitespace, so only plain text reaches the model. */
function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function postText(content: unknown): string {
  const plain = plainText(text(content));
  return plain.length > POST_TEXT_MAX ? `${plain.slice(0, POST_TEXT_MAX - 1)}…` : plain;
}

/** The first `count` words, with an ellipsis when there were more. */
function firstWords(value: string, count: number): string {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length <= count) return words.join(' ');
  return `${words.slice(0, count).join(' ')}…`;
}

interface PadletRow {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly content: string;
  readonly metadata: Record<string, unknown>;
  readonly locationLabel: string;
  readonly lat: number | null;
  readonly lng: number | null;
}

function toRow(raw: Record<string, unknown>): PadletRow {
  const metadata = (raw.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata))
    ? raw.metadata as Record<string, unknown>
    : {};
  return {
    id: text(raw.id),
    type: text(raw.type) || 'post',
    title: text(raw.title),
    content: text(raw.content),
    metadata,
    locationLabel: text(raw.location_label),
    lat: numberOf(raw.location_lat),
    lng: numberOf(raw.location_lng),
  };
}

function childIds(row: PadletRow): string[] {
  const ids = row.metadata.childPadletIds;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
}

/**
 * What a post is CALLED, for a citation label and a panel name: its title, else
 * the first words of its plain text, else its type ("Image", "Link"…). Never
 * "Untitled" -- a title-less post's text IS what it is about.
 */
function postLabel(post: PadletRow): string {
  if (post.title) return post.title;
  const snippet = firstWords(postText(post.content), POST_TITLE_WORDS);
  if (snippet) return snippet;
  return `${post.type.charAt(0).toUpperCase()}${post.type.slice(1)}`;
}

interface Panel {
  readonly name: string;
  readonly posts: readonly PadletRow[];
}

interface SectionRow {
  readonly id: string;
  readonly title: string;
  readonly position: number;
}

function toSection(raw: Record<string, unknown>): SectionRow {
  return {
    id: idText(raw.id),
    title: text(raw.title) || 'Section',
    position: numberOf(raw.position) ?? 0,
  };
}

/** Posts that are not any container's child. */
function rootPosts(posts: readonly PadletRow[]): PadletRow[] {
  const isChild = new Set<string>();
  for (const post of posts) for (const id of childIds(post)) isChild.add(id);
  return posts.filter((post) => !isChild.has(post.id));
}

/** Columns / Grid: a panel per section, its root posts by sectionPosition. */
function columnsPanels(sections: readonly SectionRow[], posts: readonly PadletRow[]): Panel[] {
  const roots = rootPosts(posts);
  return sections.map((section) => ({
    name: section.title,
    posts: roots
      .filter((post) => idText(post.metadata.sectionId) === section.id)
      .sort((a, b) => (numberOf(a.metadata.sectionPosition) ?? 0) - (numberOf(b.metadata.sectionPosition) ?? 0)),
  }));
}

/** Wall: a panel per root container, ordered by wallPosition. */
function wallPanels(posts: readonly PadletRow[]): Panel[] {
  const byId = new Map(posts.map((post) => [post.id, post]));
  return rootPosts(posts)
    .filter((post) => post.type === 'container')
    .sort((a, b) => (numberOf(a.metadata.wallPosition) ?? Number.MAX_SAFE_INTEGER) - (numberOf(b.metadata.wallPosition) ?? Number.MAX_SAFE_INTEGER))
    .map((container) => ({
      name: postLabel(container),
      posts: childIds(container).map((id) => byId.get(id)).filter((post): post is PadletRow => Boolean(post)),
    }));
}

/** Timeline: a panel per root container, ordered by position_in_timeline, with its date label. */
function timelinePanels(posts: readonly PadletRow[]): Panel[] {
  const byId = new Map(posts.map((post) => [post.id, post]));
  return rootPosts(posts)
    .filter((post) => post.type === 'container')
    .sort((a, b) => (numberOf(a.metadata.position_in_timeline) ?? Number.MAX_SAFE_INTEGER) - (numberOf(b.metadata.position_in_timeline) ?? Number.MAX_SAFE_INTEGER))
    .map((container) => {
      const label = text(container.metadata.timelineLabel);
      return {
        name: label ? `${label} · ${postLabel(container)}` : postLabel(container),
        posts: childIds(container).map((id) => byId.get(id)).filter((post): post is PadletRow => Boolean(post)),
      };
    });
}

/** Map: a panel per located post (its place), plus one "Unplaced" panel. */
function mapPanels(posts: readonly PadletRow[]): Panel[] {
  const byId = new Map(posts.map((post) => [post.id, post]));
  const panels: Panel[] = [];
  const unplaced: PadletRow[] = [];
  for (const post of rootPosts(posts)) {
    const place = post.locationLabel
      || (post.lat !== null && post.lng !== null ? `${post.lat.toFixed(2)}, ${post.lng.toFixed(2)}` : '');
    const children = post.type === 'container'
      ? childIds(post).map((id) => byId.get(id)).filter((child): child is PadletRow => Boolean(child))
      : [];
    if (place) panels.push({ name: place, posts: children.length > 0 ? children : [post] });
    else unplaced.push(post);
  }
  if (unplaced.length > 0) panels.push({ name: 'Unplaced', posts: unplaced });
  return panels;
}

interface FlatPost {
  readonly post: PadletRow;
  readonly depth: number;
}

function flattenPosts(posts: readonly PadletRow[], byId: Map<string, PadletRow>, depth = 0, seen = new Set<string>()): FlatPost[] {
  const flat: FlatPost[] = [];
  for (const post of posts) {
    if (seen.has(post.id)) continue;
    seen.add(post.id);
    flat.push({ post, depth });
    if (depth < MAX_DEPTH) {
      const children = childIds(post).map((id) => byId.get(id)).filter((child): child is PadletRow => Boolean(child));
      flat.push(...flattenPosts(children, byId, depth + 1, seen));
    }
  }
  return flat;
}

function renderPost(post: PadletRow, token: string): string {
  const parts = [post.type, postLabel(post)];
  const body = postText(post.content);
  if (body) parts.push(body);
  return `[${token}] ${parts.join(' · ')}`;
}

/**
 * The whole board as ONE overview block.
 *
 * `blockIndex` is this block's position in the array the model is given, so the
 * per-post sub-tokens (`S2.5`) can be read back by the citation layer. The
 * caller knows it; this function cannot.
 *
 * A non-Padlet board, or one the caller cannot read, resolves to `null` -- the
 * item is DROPPED, exactly as a `kanban-board` on a non-Kanban board is.
 */
export async function readPadletBoardBlock(
  client: BoardAiPadletBoardSupabaseClient,
  boardId: string,
  blockIndex: number,
): Promise<Result<ResolvedBoardAiContextBlock | null, DomainError>> {
  const { data: board, error: boardError } = await client
    .from('boards')
    .select('id, layout, title')
    .eq('id', boardId)
    .maybeSingle();
  if (boardError) return err(domainError('unavailable', 'Could not read the board'));
  if (!board) return ok(null);
  const layout = text(board.layout);
  if (!PADLET_BOARD_LAYOUTS.includes(layout)) return ok(null);
  const boardTitle = text(board.title) || 'Untitled board';

  const { data: padletRows, error: padletsError } = await client
    .from('padlets')
    .select('id, type, title, content, metadata, location_label, location_lat, location_lng')
    .eq('board_id', boardId);
  if (padletsError) return err(domainError('unavailable', 'Could not read the board posts'));
  const posts = (padletRows ?? []).map(toRow).filter((post) => post.id.length > 0);

  let sections: SectionRow[] = [];
  if (layout === 'columns' || layout === 'grid') {
    const { data: sectionRows, error: sectionsError } = await client
      .from('board_sections')
      .select('id, title, position')
      .eq('board_id', boardId)
      .order('position', { ascending: true });
    if (sectionsError) return err(domainError('unavailable', 'Could not read the board sections'));
    sections = (sectionRows ?? []).map(toSection);
  }

  const panels = layout === 'columns' || layout === 'grid'
    ? columnsPanels(sections, posts)
    : layout === 'wall'
      ? wallPanels(posts)
      : layout === 'timeline'
        ? timelinePanels(posts)
        : mapPanels(posts);

  const byId = new Map(posts.map((post) => [post.id, post]));

  // Panel headers and post lines, in the layout's own order, each post carrying
  // its token. Token numbering is global across panels and nesting, exactly as
  // the citation resolver reads it back.
  const entries: { readonly header: string | null; readonly line: string; readonly passage?: BoardAiCitablePassage }[] = [];
  let tokenIndex = 0;
  let totalPosts = 0;
  for (const panel of panels) {
    const flat = flattenPosts(panel.posts, byId);
    // PATCH-371 Addendum 1. EVERY panel is listed, empty ones too, so the model
    // sees all columns/cards (PATCH-372 fills them) rather than only the ones
    // that happen to hold posts.
    entries.push({
      header: flat.length === 0 ? `Panel "${panel.name}": (no posts)` : `Panel "${panel.name}":`,
      line: '',
    });
    for (const { post, depth } of flat) {
      totalPosts += 1;
      if (tokenIndex >= BOARD_AI_PADLET_BOARD_MAX_POSTS) continue;
      tokenIndex += 1;
      const token = `S${blockIndex + 1}.${tokenIndex}`;
      entries.push({
        header: null,
        line: `${'  '.repeat(depth)}${renderPost(post, token)}`,
        passage: { source: 'post', padletId: post.id, label: boardAiContextLabel(`${panel.name} · ${postLabel(post)}`) },
      });
    }
  }

  // Fit the character budget. The note is appended AFTER the last line that fit,
  // so room is kept back to make the omission loud rather than clipped.
  const bodyBudget = BOARD_AI_CONTEXT_MAX_SINGLE_CHARS - 60;
  const kept: string[] = [];
  const passages: BoardAiCitablePassage[] = [];
  let shown = 0;
  for (const entry of entries) {
    const line = entry.header ?? entry.line;
    if ([...kept, line].join('\n').length > bodyBudget) break;
    kept.push(line);
    if (entry.passage) { passages.push(entry.passage); shown += 1; }
  }
  const omitted = totalPosts - shown;
  if (omitted > 0) kept.push(`(${omitted} more posts not shown)`);

  const body = [`Board "${boardTitle}" (${layout})`, ...(kept.length > 0 ? kept : ['No posts on this board.'])].join('\n');

  return ok({
    type: 'padlet-board',
    label: boardAiContextLabel(boardTitle),
    ...(passages.length > 0 ? { passages } : {}),
    text: bounded(body),
  });
}
