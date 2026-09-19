// The page surface's rules: drafting, and what a proposal may and may not do.
//
// Unit 2 of .agent/wiki-plan.md. Pure domain: no client, no fetch, no React.
//
// ===========================================================================
// P3 IS ENFORCED BY THE TYPES IN THIS FILE, NOT BY THE COMPONENT
// ===========================================================================
//
// "Recompilation proposes; it never overwrites" is a claim about paths, so it
// is made true by the paths that exist here:
//
//   1. A proposal can only ever become a DRAFT. `applyProposalToDraft` returns
//      a draft, and a draft is not stored by anything -- storing needs a
//      `BoardWikiSaveRequest`, and the ONLY function in this codebase that
//      produces one takes a draft. There is deliberately no function anywhere
//      that accepts a proposal and returns a save request, which is why
//      applying still leaves the user in front of an unsaved page with a Save
//      button, and discarding costs nothing.
//
//   2. A PROPOSAL HAS NO TITLE FIELD. Unit 0's finding 4: every sentence of the
//      compiled Audi page was true and the title -- "Bumper Removal for Horn
//      Replacement", over a page containing no removal procedure -- was the one
//      overclaim, and the page that correctly DECLINED to answer still emitted
//      the heading "Chess Tournament in Berlin". "Constrain the title" as a
//      prompt instruction is a request; a type with no field for it is a fact.
//      A compiler has nowhere to put a title, so a title can only ever come
//      from a person typing one.

import {
  boardAiCitationIdentityKey,
  type BoardAiCitationItem,
} from '../ai/boardAiChatCitation';
import type { BoardWikiPageSource } from './boardWikiPageSources';

/** A stored page, as the surface reads it. */
export interface BoardWikiPage {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly content: string;
  readonly sources: readonly BoardWikiPageSource[];
  readonly compiledAt: string | null;
  /** The optimistic-concurrency token. A save carries the value it was based on. */
  readonly updatedAt: string;
}

/**
 * What a compilation produced, and the complete set of what it may offer.
 *
 * No title (see the header). No page id to write to, no permission, no
 * timestamp of its own beyond when it was made: a proposal is text, the sources
 * that text was drawn from, and the page content it was compiled against.
 */
export interface BoardWikiProposal {
  readonly id: string;
  readonly content: string;
  readonly sources: readonly BoardWikiPageSource[];
  /**
   * The page's content at compile time. Kept so the surface can tell a user
   * that the page moved underneath a pending proposal -- see
   * `boardWikiProposalWarnings`.
   */
  readonly basedOnContent: string;
  readonly createdAt: string;
}

/**
 * An in-progress edit. Carries the snapshot it began from, so "dirty" is
 * DERIVED rather than tracked -- a tracked flag survives typing a character and
 * deleting it again, and then warns about work that no longer exists.
 */
export interface BoardWikiDraft {
  readonly title: string;
  readonly content: string;
  readonly sources: readonly BoardWikiPageSource[];
  readonly baseTitle: string;
  readonly baseContent: string;
  readonly baseSourcesKey: string;
  readonly baseUpdatedAt: string;
}

/** Order-sensitive, version-sensitive, and stable enough to compare drafts by. */
function sourcesKey(sources: readonly BoardWikiPageSource[]): string {
  return JSON.stringify(sources.map((source) => [
    boardAiCitationIdentityKey(source.item),
    source.version.kind,
    source.version.kind === 'document' ? source.version.contentSha256 : null,
    source.version.updatedAt,
  ]));
}

export function boardWikiDraftFromPage(page: BoardWikiPage): BoardWikiDraft {
  return {
    title: page.title,
    content: page.content,
    sources: page.sources,
    baseTitle: page.title,
    baseContent: page.content,
    baseSourcesKey: sourcesKey(page.sources),
    baseUpdatedAt: page.updatedAt,
  };
}

export function boardWikiDraftIsDirty(draft: BoardWikiDraft): boolean {
  return draft.title !== draft.baseTitle
    || draft.content !== draft.baseContent
    || sourcesKey(draft.sources) !== draft.baseSourcesKey;
}

export function boardWikiDraftWithContent(draft: BoardWikiDraft, content: string): BoardWikiDraft {
  return { ...draft, content };
}

/**
 * THE ONLY WAY A TITLE CHANGES, and it takes a string a person typed. Nothing
 * derives a title from content, from a proposal, or from a source's filename.
 */
export function boardWikiDraftWithTitle(draft: BoardWikiDraft, title: string): BoardWikiDraft {
  return { ...draft, title };
}

/**
 * Applying a proposal, which produces a DRAFT and nothing else.
 *
 * The content and the sources chain move together -- a chain that described
 * different text than the page shows would be worse than no chain at all. The
 * title is carried through untouched, because the proposal has none to offer.
 *
 * Nothing is saved. The caller is left with an unsaved page, which is the whole
 * point: applying is reversible until the user presses Save, and discarding is
 * free.
 */
export function applyProposalToDraft(
  draft: BoardWikiDraft,
  proposal: BoardWikiProposal,
): BoardWikiDraft {
  return { ...draft, content: proposal.content, sources: proposal.sources };
}

/**
 * What the user must be told before applying.
 *
 * A SET, NOT A RANKING, and deliberately so: both conditions can hold at once,
 * they are lost in different ways, and choosing which one to mention would hide
 * a real cost. Unsaved edits exist nowhere but this browser tab; a page that
 * moved was saved by someone, and Unit 1's schema keeps no version history, so
 * overwriting it loses that too. Neither is recoverable, so both are said.
 *
 * Neither BLOCKS applying. The user decides; the surface's job is that the
 * decision is informed.
 */
export type BoardWikiProposalWarning = 'unsaved-edits' | 'page-moved';

export function boardWikiProposalWarnings(
  page: BoardWikiPage,
  draft: BoardWikiDraft,
  proposal: BoardWikiProposal,
): readonly BoardWikiProposalWarning[] {
  const warnings: BoardWikiProposalWarning[] = [];
  if (boardWikiDraftIsDirty(draft)) warnings.push('unsaved-edits');
  if (page.content !== proposal.basedOnContent) warnings.push('page-moved');
  return warnings;
}

/**
 * The stored write, and the only shape the save path accepts.
 *
 * `baseUpdatedAt` is what makes concurrent editing safe without a merge: a save
 * whose base no longer matches the stored row is a CONFLICT the user is told
 * about, never a silent last-write-wins. P3 rules out merge semantics; it does
 * not rule out noticing.
 */
export interface BoardWikiSaveRequest {
  readonly title: string;
  readonly content: string;
  /**
   * IDENTITIES ONLY, AND NO VERSIONS. A version is the input to the staleness
   * comparison, so a client that could send one could declare its own page
   * fresh -- and the chain, which is P1's entire mitigation, would be a claim
   * the page makes about itself. The server holds the versions and keeps them.
   */
  readonly sources: readonly BoardAiCitationItem[];
  readonly baseUpdatedAt: string;
}

/**
 * The single producer of a save request, and it takes a DRAFT.
 *
 * Nothing overloads it to take a proposal, and nothing should: that overload is
 * exactly the automatic write path this unit exists to make impossible. A
 * proposal reaches storage only by being applied into a draft a person is
 * looking at and then saved by that person.
 */
export function boardWikiSaveRequestFromDraft(draft: BoardWikiDraft): BoardWikiSaveRequest {
  return {
    title: draft.title,
    content: draft.content,
    sources: draft.sources.map((source) => source.item),
    baseUpdatedAt: draft.baseUpdatedAt,
  };
}

/**
 * A title a person typed, validated at the boundary the same way the schema
 * validates it (`length(btrim(title)) > 0`). Returned trimmed, so a title of
 * spaces cannot pass a non-empty check and then store as blank.
 */
export function boardWikiTitleIsUsable(title: string): boolean {
  return title.trim().length > 0;
}

/**
 * The page's address within its board, derived from the title a person typed.
 *
 * GERMAN IS THE REFERENCE CORPUS, so the transliteration is not decoration:
 * "Stoßstange" must not become "sto-stange". Combining marks are stripped after
 * NFD normalisation (ä → a), and ß is expanded to ss before that, because it
 * has no decomposition and would otherwise be dropped entirely.
 *
 * Returns null rather than a fallback when nothing addressable survives -- a
 * title of only punctuation or only CJK produces no slug, and inventing
 * "page-1" would hand the user an address that says nothing about their page.
 * The schema's CHECK is the same shape, so an unusable slug fails here with a
 * sentence rather than there with a constraint violation.
 */
export function boardWikiSlugFromTitle(title: string): string | null {
  const slug = title
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : null;
}
