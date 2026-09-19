import { NextResponse } from 'next/server';
import type { DomainError, DomainErrorCode } from '../../domain/core/errors';
import type { Result } from '../../domain/core/result';
import {
  boardWikiCitationItemFromStored,
  boardWikiPageFreshness,
  boardWikiSourceStates,
  type BoardWikiCurrentVersions,
} from '../../domain/wiki/boardWikiPageSources';
import type { BoardWikiPage, BoardWikiSaveRequest } from '../../domain/wiki/boardWikiEditing';

/**
 * The wiki page surface's HTTP edge -- reading a page, creating one, saving one.
 *
 * SAME SHAPE AS THE HIGHLIGHT AND DOCUMENT-DELETE ROUTES, deliberately: the
 * session hands back an identity and bound commands, never a Supabase client,
 * so a handler here cannot choose an authority or construct infrastructure.
 * Board identity comes from the ROUTE path and the user from the session.
 *
 * ===========================================================================
 * THERE IS NO "APPLY PROPOSAL" OPERATION HERE, AND THAT IS THE UNIT'S POINT
 * ===========================================================================
 *
 * The obvious endpoint -- POST a proposal id, server copies its content onto
 * the page -- is exactly the automatic write path P3 forbids, and it would be
 * one request away from being called by a scheduler, a retry, or a well-meaning
 * "refresh all pages" button. So it does not exist.
 *
 * Applying happens in the browser: the proposal's text is loaded into the
 * user's draft, the user looks at it, and the user presses Save. That save
 * arrives here as an ordinary `PATCH` carrying text -- indistinguishable from
 * text the user typed, because by then it is text the user has accepted. The
 * server therefore never needs to know whether content came from a compilation,
 * which is the only way it can be certain it never wrote one on its own.
 */

export interface BoardWikiPageRouteContext {
  readonly params: Promise<{ id: string }>;
}

export interface BoardWikiPageItemRouteContext {
  readonly params: Promise<{ id: string; pageId: string }>;
}

/** A page plus everything derived about its sources, as the surface reads it. */
export interface BoardWikiPageRead {
  readonly page: BoardWikiPage;
  /** Each source's version as it is NOW. A missing entry means gone. */
  readonly currentVersions: BoardWikiCurrentVersions;
}

export interface BoardWikiPageSummary {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly updatedAt: string;
  readonly sourceCount: number;
}

export interface BoardWikiSession {
  readonly userId: string;
  listPages(input: {
    readonly boardId: string;
    readonly userId: string;
  }): Promise<Result<readonly BoardWikiPageSummary[], DomainError>>;
  readPage(input: {
    readonly boardId: string;
    readonly pageId: string;
    readonly userId: string;
  }): Promise<Result<BoardWikiPageRead, DomainError>>;
  createPage(input: {
    readonly boardId: string;
    readonly userId: string;
    readonly title: string;
  }): Promise<Result<BoardWikiPage, DomainError>>;
  savePage(input: {
    readonly boardId: string;
    readonly pageId: string;
    readonly userId: string;
    readonly request: BoardWikiSaveRequest;
  }): Promise<Result<BoardWikiPage, DomainError>>;
  deletePage(input: {
    readonly boardId: string;
    readonly pageId: string;
    readonly userId: string;
  }): Promise<Result<{ readonly deleted: true }, DomainError>>;
}

export interface BoardWikiRouteDependencies {
  getAuthenticatedSession(): Promise<BoardWikiSession | null>;
}

const UNAVAILABLE = 'The board wiki is temporarily unavailable';

const ERROR_RESPONSES: Record<DomainErrorCode, { status: number; error: string }> = {
  validation: { status: 400, error: 'Invalid request' },
  permission_denied: { status: 403, error: 'Forbidden' },
  // A page on a board the caller cannot read is not_found, never forbidden:
  // "forbidden" confirms the id exists, which is the leak the knowledge routes
  // already refuse to make.
  not_found: { status: 404, error: 'Wiki page was not found' },
  conflict: { status: 409, error: 'This page changed while you were editing it' },
  rate_limited: { status: 429, error: 'Too many requests' },
  quota_exceeded: { status: 403, error: 'Forbidden' },
  unavailable: { status: 503, error: UNAVAILABLE },
  unknown: { status: 500, error: 'Could not complete the request' },
};

function failure(error: DomainError): NextResponse {
  const mapped = ERROR_RESPONSES[error.code] ?? ERROR_RESPONSES.unknown;
  return NextResponse.json({ error: mapped.error }, { status: mapped.status });
}

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

async function resolveSession(
  deps: BoardWikiRouteDependencies,
): Promise<BoardWikiSession | null> {
  try {
    return await deps.getAuthenticatedSession();
  } catch {
    return null;
  }
}

/**
 * The page as JSON, with staleness DERIVED here rather than stored anywhere.
 *
 * Unit 1's rule, one layer up: the response says what each source is right now,
 * computed from the recorded compile-time version against the current one. A
 * client that cached this answer would be caching a fact about a moment, which
 * is why nothing persists it.
 */
function pageResponseBody(read: BoardWikiPageRead) {
  const states = boardWikiSourceStates(read.page.sources, read.currentVersions);
  return {
    page: {
      id: read.page.id,
      slug: read.page.slug,
      title: read.page.title,
      content: read.page.content,
      compiledAt: read.page.compiledAt,
      updatedAt: read.page.updatedAt,
    },
    // The recorded compile-time version travels WITH the item, so the surface's
    // draft is a faithful copy of the chain rather than a placeholder that
    // would read as changed the moment anything compared it. It is not a
    // secret: a hash and a timestamp of a source this reader can already open.
    // It comes back on save as nothing at all -- see `parseSaveRequest`.
    sources: states.map((status) => ({
      item: status.source.item,
      version: status.source.version,
      state: status.state,
    })),
    freshness: boardWikiPageFreshness(states),
  };
}

export function createBoardWikiListHandler(deps: BoardWikiRouteDependencies) {
  return async function GET(
    _request: Request,
    context: BoardWikiPageRouteContext,
  ): Promise<NextResponse> {
    const session = await resolveSession(deps);
    if (!session) return unauthorized();

    const { id } = await context.params;
    let result: Result<readonly BoardWikiPageSummary[], DomainError>;
    try {
      result = await session.listPages({ boardId: id, userId: session.userId });
    } catch {
      return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
    }
    if (!result.ok) return failure(result.error);
    return NextResponse.json({ pages: result.value }, { status: 200 });
  };
}

export function createBoardWikiCreateHandler(deps: BoardWikiRouteDependencies) {
  return async function POST(
    request: Request,
    context: BoardWikiPageRouteContext,
  ): Promise<NextResponse> {
    const session = await resolveSession(deps);
    if (!session) return unauthorized();

    const { id } = await context.params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    // A TITLE IS THE ONLY THING THIS ACCEPTS. Not a slug (derived), not
    // content (a new page starts empty), not sources (nothing has been
    // compiled yet), and not an author (the session is the author).
    const title = typeof (body as { title?: unknown })?.title === 'string'
      ? (body as { title: string }).title.trim()
      : '';
    if (title.length === 0) {
      return NextResponse.json({ error: 'A page needs a title' }, { status: 400 });
    }

    let result: Result<BoardWikiPage, DomainError>;
    try {
      result = await session.createPage({ boardId: id, userId: session.userId, title });
    } catch {
      return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
    }
    if (!result.ok) return failure(result.error);
    return NextResponse.json(
      { page: { id: result.value.id, slug: result.value.slug, title: result.value.title } },
      { status: 201 },
    );
  };
}

export function createBoardWikiReadHandler(deps: BoardWikiRouteDependencies) {
  return async function GET(
    _request: Request,
    context: BoardWikiPageItemRouteContext,
  ): Promise<NextResponse> {
    const session = await resolveSession(deps);
    if (!session) return unauthorized();

    const { id, pageId } = await context.params;
    let result: Result<BoardWikiPageRead, DomainError>;
    try {
      result = await session.readPage({ boardId: id, pageId, userId: session.userId });
    } catch {
      return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
    }
    if (!result.ok) return failure(result.error);
    return NextResponse.json(pageResponseBody(result.value), { status: 200 });
  };
}

/**
 * The save body, read as untrusted input.
 *
 * `sources` goes through the same strict parser the stored column does: this
 * value round-trips through a browser, so it arrives with exactly the trust a
 * stored jsonb column has, which is none.
 */
function parseSaveRequest(body: unknown): BoardWikiSaveRequest | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const entry = body as Record<string, unknown>;
  if (typeof entry.title !== 'string' || entry.title.trim().length === 0) return null;
  if (typeof entry.content !== 'string') return null;
  if (typeof entry.baseUpdatedAt !== 'string' || entry.baseUpdatedAt.length === 0) return null;
  // IDENTITIES ONLY. A version sent from a browser would let a page declare
  // itself fresh, and the chain is the one thing on this surface that has to be
  // a fact rather than a claim the page makes about itself.
  const sources = (Array.isArray(entry.sources) ? entry.sources : [])
    .map(boardWikiCitationItemFromStored)
    .filter((item): item is NonNullable<typeof item> => item !== null);
  return {
    title: entry.title.trim(),
    content: entry.content,
    sources,
    baseUpdatedAt: entry.baseUpdatedAt,
  };
}

export function createBoardWikiSaveHandler(deps: BoardWikiRouteDependencies) {
  return async function PATCH(
    request: Request,
    context: BoardWikiPageItemRouteContext,
  ): Promise<NextResponse> {
    const session = await resolveSession(deps);
    if (!session) return unauthorized();

    const { id, pageId } = await context.params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const saveRequest = parseSaveRequest(body);
    if (!saveRequest) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

    let result: Result<BoardWikiPage, DomainError>;
    try {
      result = await session.savePage({
        boardId: id,
        pageId,
        userId: session.userId,
        request: saveRequest,
      });
    } catch {
      return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
    }
    // A CONFLICT IS A 409 THE USER IS TOLD ABOUT, not a merge and not a
    // last-write-wins. P3 rules out reconciling two versions; it does not rule
    // out noticing that there are two.
    if (!result.ok) return failure(result.error);

    return NextResponse.json(
      { page: { id: result.value.id, title: result.value.title, updatedAt: result.value.updatedAt } },
      { status: 200 },
    );
  };
}

/**
 * Deleting one page (Unit 2b).
 *
 * WHY THIS EXISTS AT ALL, stated because "add a delete" is exactly the kind of
 * scope creep a plan should refuse: a create-only surface accumulates mistakes
 * nobody can remove, and Unit 2's own live pass proved it in one pass -- it
 * left a scratch page on the reference board that needed SQL to clear.
 *
 * NO TRASH AND NO UNDO. Both are real infrastructure -- a retention rule, a
 * restore path, a second lifecycle for every consumer of a page -- built on the
 * speculation that someone will want them. The honest alternative is to say
 * plainly what is lost BEFORE the click, in the rollback's own words, and then
 * do exactly what the user asked.
 *
 * Proposals go with the page by FK (`page_id ... ON DELETE CASCADE`), which is
 * correct and not a loss: a proposal for a page that no longer exists has
 * nothing to be applied to.
 */
export function createBoardWikiDeleteHandler(deps: BoardWikiRouteDependencies) {
  return async function DELETE(
    _request: Request,
    context: BoardWikiPageItemRouteContext,
  ): Promise<NextResponse> {
    const session = await resolveSession(deps);
    if (!session) return unauthorized();

    const { id, pageId } = await context.params;

    // NO BODY IS READ. The page is named by the path and the user by the
    // session, so there is nothing a request could say that would change what
    // this deletes -- the same discipline the knowledge-document delete route
    // took for the same reason.
    let result: Result<{ readonly deleted: true }, DomainError>;
    try {
      result = await session.deletePage({ boardId: id, pageId, userId: session.userId });
    } catch {
      return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
    }
    if (!result.ok) return failure(result.error);
    return NextResponse.json({ deleted: true }, { status: 200 });
  };
}
