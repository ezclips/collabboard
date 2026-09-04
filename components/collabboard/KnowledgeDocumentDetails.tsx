"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Crop, GripVertical, Search, Sparkles, SquareDashedMousePointer, StickyNote, X } from 'lucide-react';
import type {
  KnowledgeSourcePageRequest,
} from '@/lib/domain/knowledge/knowledgeSourceNoteDraft';
import { MAX_SOURCE_REFERENCE_QUOTE_LENGTH } from '@/lib/domain/knowledge/knowledgeSourceReferenceWrite';
import { useKnowledgeReaderActivePage } from './useKnowledgeReaderActivePage';

/**
 * PDF-R6J. One compact icon button, used by every page/document action in the
 * reader.
 *
 * The page actions used to be text buttons wide enough to crowd the page they
 * sat above. Fixed square dimensions keep the whole row on one line and keep
 * the buttons the same size as each other, which is what makes them read as a
 * group rather than as four unrelated controls.
 */
const KNOWLEDGE_ICON_BUTTON_CLASS =
  'inline-flex h-6 w-6 flex-none shrink-0 items-center justify-center rounded border border-gray-200 '
  + 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 '
  + 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-400 '
  + 'disabled:cursor-not-allowed disabled:opacity-40';
/**
 * PDF-C1 Text -- the exact-span selection contract moved OUT of this file so
 * the canvas card obeys the same one instead of re-deriving it. Nothing about
 * this reader's behaviour changed in the move: same functions, same refusals,
 * same request shape, same attribute marking the coordinate space.
 */
import {
  PAGE_TEXT_ROOT,
  buildSelectionSourceRequest,
  captureExactSelection,
  type CapturedPageSelection,
} from '@/components/collabboard/knowledgeSourceTextSelection';
import { TEXT_ACTION_SELECTED_TEXT_MAX } from '@/lib/ai/textActions';
import {
  KNOWLEDGE_SOURCE_CLIP_MIME,
  buildKnowledgeSourceClipTransfer,
} from '@/lib/domain/knowledge/knowledgeSourceClipPayload';
import {
  KNOWLEDGE_SOURCE_NOTE_TOP_STRIP_COLORS,
  KNOWLEDGE_SOURCE_CLIP_COLOR_HINT,
} from '@/lib/domain/knowledge/knowledgeSourceNoteColorChoice';
import {
  useKnowledgeHighlightDelete,
  useKnowledgeSourceBacklinksForDocument,
  useKnowledgeSourceReferencesForDocument,
  useKnowledgeStandaloneHighlights,
} from '@/components/collabboard/KnowledgeSourceReferenceContext';
import KnowledgeDocumentPageRegionSelector from '@/components/collabboard/KnowledgeDocumentPageRegionSelector';
import { normalizeStorableRegion } from '@/lib/domain/knowledge/knowledgePageRegionGeometry';
import type { KnowledgePageRotation, NormalizedPageRegion }
  from '@/lib/domain/knowledge/knowledgePageRegionGeometry';
import {
  KNOWLEDGE_HIGHLIGHT_IDS_ATTRIBUTE,
  knowledgeHighlightIdsAttribute,
  knowledgeStandaloneHighlightColor,
  knowledgeStandaloneHighlightSegments,
} from '@/lib/domain/knowledge/knowledgeStandaloneHighlights';
import {
  knowledgeCitationFocusFor,
  knowledgeReaderSegments,
} from '@/lib/domain/knowledge/knowledgeStandaloneHighlights';
import type { KnowledgeReaderSegment }
  from '@/lib/domain/knowledge/knowledgeStandaloneHighlights';
import type { KnowledgeSourceHighlight }
  from '@/lib/domain/knowledge/knowledgeSourceHighlight';
import {
  knowledgeHighlightNoteTarget,
  knowledgeHighlightNoteTargets,
} from '@/lib/domain/knowledge/knowledgeStandaloneHighlightIndex';
import KnowledgeHighlightActions from '@/components/collabboard/KnowledgeHighlightActions';
import type { KnowledgeHighlightAction } from '@/components/collabboard/KnowledgeHighlightActions';
import type { KnowledgeSourceHighlightSegment } from '@/lib/domain/knowledge/knowledgeSourceHighlights';
import {
  knowledgeSourceBacklinkDocumentRows,
  knowledgeSourceBacklinkPageRows,
} from '@/lib/domain/knowledge/knowledgeSourceBacklinks';
import type { KnowledgeSourceBacklinkRow } from '@/lib/domain/knowledge/knowledgeSourceBacklinks';

export interface KnowledgeDocumentDetailPage {
  pageNumber: number;
  text: string;
  /**
   * P6J-F9-A2b. Canonical persisted page geometry, optional because pre-A1 rows
   * and the older render tests carry none. Used only to reserve image layout;
   * it is never a coordinate space for F8 selections.
   */
  widthPoints?: number | null;
  heightPoints?: number | null;
  rotation?: number | null;
}

export interface KnowledgeDocumentDetailsProps {
  /**
   * Optional only so the pre-F5 render tests still compile; the live list
   * always supplies it. The Create Note action fails closed without it rather
   * than emitting a request with no real source identity.
   */
  documentId?: string;
  /**
   * P6J-F9-A2b. Addresses the authenticated page-image route. Optional like
   * documentId: without it the reader renders exactly the text it always did.
   */
  boardId?: string;
  originalFilename: string;
  pageCount: number | null;
  pages: readonly KnowledgeDocumentDetailPage[];
  loading: boolean;
  error: boolean;
  onBack: () => void;
  /**
   * Set by a host that renders the document's identity itself -- the reader's
   * Library panel does. The workspace then starts at the document instead of
   * repeating Back / filename / page count / Used in Notes above it, which is
   * the whole point of splitting the two regions.
   */
  hostRendersDocumentHeader?: boolean;
  /**
   * Absent for readers who cannot create posts on this board. The action is
   * then not rendered at all rather than rendered disabled -- the same
   * capability the canvas toolbar itself is gated on decides this.
   */
  onCreateNoteFromPage?: (request: KnowledgeSourcePageRequest) => void;
  /**
   * PDF Source AI Phase 1. Absent for the same readers `onCreateNoteFromPage`
   * is absent for -- the drawer only ever supplies this alongside it, so a
   * read-only viewer can never activate an AI session with nowhere for its
   * result to go. Fires the SAME exact-selection request Note Post builds;
   * unlike Note Post, it opens no editor and performs no write.
   */
  onAiFromSelection?: (request: KnowledgeSourcePageRequest) => void;
  /**
   * BCHAT-D2. Hands one page, or one exact selection, to Board AI as an
   * IDENTITY. Never the text: the server reloads that from the id on every
   * turn, so nothing here is a source of truth about what a page says.
   */
  onAddBoardAiContext?: (item: BoardAiDraftContextItem) => void;
  /**
   * P6J-F6-B2. Page-level navigation only -- scroll the page into view once,
   * when the reader was opened from a Note's source. No highlight, no
   * geometry, no char offsets.
   */
  initialPageNumber?: number;
  /**
   * P6J-F6-B4-B4. Which stored citation the arriving Note asked for. A hint,
   * not a coordinate: the span it scrolls to is whatever the already-derived
   * segments resolved, so a drifted row lands on its recovered text and a row
   * that resolves to nothing simply keeps B2's page-level arrival.
   */
  initialSourceReferenceId?: string;
  /** Distinguishes a repeat request for the SAME citation from a rerender. */
  initialSourceRequestId?: number;
  /**
   * P6J-F6-B3N. Asks the canvas to open one citing Note, by padlet id. Absent
   * outside a canvas, which is what keeps the rows non-interactive there.
   */
  onOpenBacklinkTarget?: (targetPadletId: string) => void;
}

/**
 * P6J-F6-B4-B4. Everything one page's renderer needs to make persisted spans
 * interactive. Target identity comes from the segment's own spans and never
 * from the DOM: `data-knowledge-source-highlight-count` is an aggregate for
 * display and tests, and routing on it would open a Note for a run it does not
 * actually cite.
 */
interface PageSourceInteraction {
  /** The citation this arrival is aimed at, or null when there is none. */
  readonly navigationReferenceId: string | null;
  readonly navigationRef: React.MutableRefObject<HTMLElement | null>;
  /** Notes currently listed as citing this document -- the only valid targets. */
  readonly eligibleTargets: ReadonlySet<string>;
  /** Absent outside a canvas, which keeps every piece non-interactive. */
  readonly onActivate: ((targets: readonly string[]) => void) | null;
  /**
   * PDF-R6K-H2B-C1 -- what a click on a painted run opens.
   *
   * The old gesture opened the citing Note directly. It cannot any more: a
   * highlight may have no Note at all, and it now has an action of its own, so
   * the click opens a compact control instead of guessing between them.
   */
  readonly onOpenHighlightActions: ((actions: readonly KnowledgeHighlightAction[]) => void) | null;
  /** Highlight id -> its row, for deriving that highlight's own Note target. */
  readonly highlightsById: ReadonlyMap<string, KnowledgeSourceHighlight>;
  /** Citation id -> the Note it belongs to. Derived, never stored on a highlight. */
  readonly noteTargets: ReadonlyMap<string, string>;
}

type TextMatch = { pageIndex: number; start: number; end: number };

/** P6J-F9-B2. The reader's ONE armed rectangle, already in SOURCE coordinates. */
interface ArmedPageRegion {
  readonly pageNumber: number;
  readonly region: NormalizedPageRegion;
  readonly appliedRotation: KnowledgePageRotation;
}

/**
 * P6J-F8-B1. The one element allowed to start a Knowledge drag. Everything
 * else inside the reader -- the page text above all -- is suppressed below, so
 * this attribute is what the suppression handler tests for.
 */
const CLIP_CHIP = 'data-knowledge-clip-chip';

/**
 * A source opened from a semantic result arrives with no pageCount, so counting
 * the not-yet-loaded pages would claim "0 pages" about a document we simply have
 * not read yet. Absent knowledge is rendered as no claim at all.
 */
export function pageCountSummary(pageCount: number | null, pageLength: number, loading: boolean): string | null {
  if (pageCount !== null) return pageCount === 1 ? '1 page' : `${pageCount} pages`;
  if (loading || pageLength === 0) return null;
  return pageLength === 1 ? '1 page' : `${pageLength} pages`;
}

function findMatches(pages: readonly KnowledgeDocumentDetailPage[], query: string): TextMatch[] {
  const needle = query.toLowerCase();
  if (!needle) return [];
  return pages.flatMap((page, pageIndex) => {
    const source = page.text.toLowerCase();
    const matches: TextMatch[] = [];
    let offset = 0;
    while (offset < source.length) {
      const start = source.indexOf(needle, offset);
      if (start < 0) break;
      matches.push({ pageIndex, start, end: start + needle.length });
      offset = start + needle.length;
    }
    return matches;
  });
}

/** Distinct standalone highlights overlapping a run, by durable id. */
function sourceCountOver(
  segments: readonly KnowledgeReaderSegment[],
  start: number,
  end: number,
): number {
  const ids = new Set<string>();
  for (const segment of segments) {
    if (segment.end <= start || segment.start >= end) continue;
    for (const span of segment.spans) ids.add(span.highlightId);
  }
  return ids.size;
}

/**
 * PDF-R6K-H2B-C1 -- one contextual row per highlight covering a run.
 *
 * Each row carries its OWN Note target, derived from that highlight's origin
 * citation rather than stored on the highlight. Three cases collapse to "no
 * Note": a plain highlight, one orphaned when its citing Note was deleted, and
 * one whose Note the board no longer holds. All three must offer no Open Note,
 * and none of them stops the highlight painting or being deleted.
 */
function highlightActionsOf(
  segment: KnowledgeReaderSegment,
  highlightsById: ReadonlyMap<string, KnowledgeSourceHighlight>,
  noteTargets: ReadonlyMap<string, string>,
  eligible: ReadonlySet<string>,
): readonly KnowledgeHighlightAction[] {
  const actions: KnowledgeHighlightAction[] = [];
  for (const span of segment.spans) {
    const row = highlightsById.get(span.highlightId);
    const target = row === undefined
      ? null
      : knowledgeHighlightNoteTarget(row, noteTargets);
    actions.push({
      highlightId: span.highlightId,
      color: span.color,
      targetPadletId: target !== null && eligible.has(target) ? target : null,
    });
  }
  return actions;
}

import {
  boardAiDraftFromPage,
  boardAiDraftFromSelection,
  type BoardAiDraftContextItem,
} from '@/lib/domain/ai/boardAiChatDraftContext';

/**
 * Did this drag begin inside the text the user has selected?
 *
 * A pure geometry/containment question, used ONLY to decide whether the drag
 * is a deliberate grab of the highlight. It never becomes provenance: the
 * payload is always built from the re-proved activeSelection, so a live range
 * that disagreed with it could not smuggle different offsets onto the board.
 *
 * Falls back to false whenever the answer is not clearly yes -- a drag that
 * cannot be shown to start inside the selection is refused, as before.
 */
function dragStartsInsideSelection(event: React.DragEvent): boolean {
  if (typeof window === 'undefined') return false;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return false;
  const range = selection.getRangeAt(0);
  const target = event.target instanceof Node ? event.target : null;
  if (target === null) return false;
  // `intersectsNode` is the containment question; where it is unavailable the
  // answer is simply "not proven", never "assume yes".
  if (typeof range.intersectsNode !== 'function') return false;
  try {
    return range.intersectsNode(target);
  } catch {
    return false;
  }
}

/** Text Phase 1. One not-yet-saved highlight color choice, page-relative. */
interface SelectionColorPreview {
  readonly pageNumber: number;
  readonly charStart: number;
  readonly charEnd: number;
  readonly color: string;
}

/**
 * Text Phase 1. Splits [start,end) around a TRANSIENT color preview -- inline
 * flow only, exactly like the persisted-highlight `<span>` below, so
 * `.textContent` reconstructs identically whether or not a piece is wrapped.
 * Falls through to one plain node with no overlap, so it drops in wherever a
 * plain fragment was emitted before this existed.
 */
function withPreview(
  text: string,
  start: number,
  end: number,
  keyPrefix: string,
  preview: { readonly start: number; readonly end: number; readonly color: string } | null,
): React.ReactNode[] {
  const from = preview ? Math.max(preview.start, start) : start;
  const to = preview ? Math.min(preview.end, end) : start;
  if (!preview || from >= to) return [<React.Fragment key={keyPrefix}>{text.slice(start, end)}</React.Fragment>];
  const nodes: React.ReactNode[] = [];
  if (start < from) nodes.push(<React.Fragment key={`${keyPrefix}-pre`}>{text.slice(start, from)}</React.Fragment>);
  nodes.push(
    <span
      key={`${keyPrefix}-preview`}
      data-knowledge-selection-color-preview="true"
      style={{ backgroundColor: preview.color }}
      className="rounded-sm"
    >
      {text.slice(from, to)}
    </span>,
  );
  if (to < end) nodes.push(<React.Fragment key={`${keyPrefix}-post`}>{text.slice(to, end)}</React.Fragment>);
  return nodes;
}

/**
 * Renders one page as a flat sequence of pieces, each substring emitted exactly
 * once and in order, so `textContent` still reconstructs `page.text` verbatim.
 * That is not cosmetic: B4-B2B measures selection offsets against this very
 * text, and a duplicated or reordered piece would silently move every
 * subsequent coordinate.
 *
 * Search wins where the two overlap. A match stays ONE <mark>, which keeps the
 * yellow/blue visuals, the active-match ref and every existing search
 * assertion exactly as they were; an overlapping citation rides along as a data
 * marker on that same element rather than splitting it.
 */
function highlightedText(
  text: string,
  pageMatches: readonly TextMatch[],
  activeMatch: TextMatch | undefined,
  activeRef: React.MutableRefObject<HTMLElement | null>,
  sourceSegments: readonly KnowledgeReaderSegment[],
  interaction: PageSourceInteraction,
  preview: { readonly start: number; readonly end: number; readonly color: string } | null,
) {
  const nodes: React.ReactNode[] = [];
  // The arrival ref belongs on the FIRST piece of the requested citation; the
  // rest share its emphasis but must not steal the scroll.
  let navigationAnchored = false;

  // Outside a search match the citations decide the cuts.
  const pushUnmatched = (start: number, end: number) => {
    if (end <= start) return;
    if (sourceSegments.length === 0) {
      nodes.push(...withPreview(text, start, end, `text-${start}`, preview));
      return;
    }
    for (const segment of sourceSegments) {
      const from = Math.max(segment.start, start);
      const to = Math.min(segment.end, end);
      if (from >= to) continue;
      const piece = text.slice(from, to);
      /*
        PDF-R6K-H2B-C1. A run with no highlight is plain text -- UNLESS it is
        the citation being navigated to, which still needs its transient ring.
        That is the whole of "jump to source works with no mark": the span is
        rendered for the focus alone and carries no background, so once the
        navigation focus clears nothing is left behind.
      */
      if (segment.spans.length === 0 && !segment.focused) {
        nodes.push(...withPreview(text, from, to, `text-${from}`, preview));
        continue;
      }
      /*
        PDF-R6K-H2B-C1. Arrival is now a CITATION fact, not a painted one.

        `focused` comes from the citation's own resolved span, so a jump to
        source rings the passage whether or not any highlight covers it -- and
        the ring is transient navigation feedback that leaves no persistent
        background behind when it clears. That is what keeps this from being a
        disguised citation-derived highlight.
      */
      const isArrival = segment.focused;
      const anchorHere = isArrival && !navigationAnchored;
      if (anchorHere) navigationAnchored = true;

      /*
        The persistent background is the STANDALONE highlights' and theirs
        alone. Disagreeing colours over one run still fail closed, for the
        original reason: one background cannot honestly represent two marks.
      */
      const tint = knowledgeStandaloneHighlightColor(segment.spans);
      const painted = segment.spans.length > 0;

      // Clicking a painted run opens its contextual control. A click that ends
      // a drag-selection is the user selecting text, so it is suppressed --
      // the same rule the old navigation click applied, for the same reason.
      const activate = !painted || interaction.onOpenHighlightActions === null
        ? null
        : () => {
          const selection = typeof window === 'undefined' ? null : window.getSelection();
          if (selection && !selection.isCollapsed) return;
          interaction.onOpenHighlightActions!(highlightActionsOf(
            segment, interaction.highlightsById, interaction.noteTargets,
            interaction.eligibleTargets,
          ));
        };

      nodes.push(
        <span
          key={`source-${from}`}
          ref={anchorHere ? interaction.navigationRef : undefined}
          style={tint ? { backgroundColor: tint } : undefined}
          data-knowledge-source-highlight={painted ? 'true' : undefined}
          data-knowledge-source-highlight-count={painted ? segment.spans.length : undefined}
          // The durable delete targets, so a click resolves to real rows rather
          // than to a quote string or an offset guess.
          {...(painted
            ? { [KNOWLEDGE_HIGHLIGHT_IDS_ATTRIBUTE]: knowledgeHighlightIdsAttribute(segment.spans) }
            : {})}
          data-knowledge-source-navigation-target={isArrival ? 'true' : undefined}
          data-knowledge-source-focus-reference-id={
            isArrival ? interaction.navigationReferenceId ?? undefined : undefined
          }
          role={activate ? 'button' : undefined}
          tabIndex={activate ? 0 : undefined}
          onClick={activate ?? undefined}
          onKeyDown={activate
            ? (event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              // Space would otherwise scroll the reader out from under the user.
              event.preventDefault();
              activate();
            }
            : undefined}
          className={[
            'rounded-sm',
            // A highlight's own colour replaces the neutral background. An
            // unpainted run gets NO background at all -- only the transient
            // arrival ring, which is why a citation with no highlight leaves
            // nothing behind once navigation focus clears.
            tint ? '' : (painted ? 'bg-sky-100' : ''),
            isArrival ? 'ring-1 ring-sky-400' : '',
            activate ? 'cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400' : '',
          ].filter(Boolean).join(' ')}
        >
          {piece}
        </span>,
      );
    }
  };

  let cursor = 0;
  pageMatches.forEach((match) => {
    pushUnmatched(cursor, match.start);
    const active = match === activeMatch;
    const sources = sourceCountOver(sourceSegments, match.start, match.end);
    nodes.push(
      <mark
        key={`match-${match.start}`}
        ref={active ? activeRef : undefined}
        data-active-match={active ? 'true' : undefined}
        data-knowledge-source-highlight={sources > 0 ? 'true' : undefined}
        data-knowledge-source-highlight-count={sources > 0 ? sources : undefined}
        className={active ? 'rounded bg-blue-300 text-gray-900 ring-2 ring-blue-500' : 'rounded bg-yellow-200 text-gray-900'}
      >
        {text.slice(match.start, match.end)}
      </mark>,
    );
    cursor = match.end;
  });
  pushUnmatched(cursor, text.length);
  return nodes;
}

/**
 * P6J-F6-B3 reverse provenance, made navigable by B3N.
 *
 * A row is a real button only where the surface was handed a navigation
 * callback; without one it stays B3's plain text, so a reader mounted outside
 * a canvas never offers an action that cannot work. Either way the target id
 * rides on the row as a data attribute -- the visible text is never looked up.
 */
export function UsedInNotes({ scope, rows, onOpen }: {
  scope: 'document' | 'page';
  rows: readonly KnowledgeSourceBacklinkRow[];
  onOpen?: (targetPadletId: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div data-knowledge-used-in-notes={scope} className="mt-1">
      <p className="text-[11px] font-medium text-gray-500">Used in Notes · {rows.length}</p>
      <ul className="mt-0.5 space-y-0.5">
        {rows.map((row) => (
          <li key={row.targetPadletId} data-knowledge-backlink-target={row.targetPadletId} className="min-w-0">
            {onOpen ? (
              <button
                type="button"
                // The id, never the row's text: two Notes can read identically.
                onClick={() => onOpen(row.targetPadletId)}
                title={row.displayText}
                className="block w-full cursor-pointer truncate rounded pl-2 text-left text-[11px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-300"
              >
                {row.displayText}
              </button>
            ) : (
              <span className="block truncate pl-2 text-[11px] text-gray-600" title={row.displayText}>
                {row.displayText}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function KnowledgeDocumentDetails({
  documentId,
  boardId,
  originalFilename,
  pageCount,
  hostRendersDocumentHeader = false,
  pages,
  loading,
  error,
  onBack,
  onCreateNoteFromPage,
  onAiFromSelection,
  onAddBoardAiContext,
  initialPageNumber,
  initialSourceReferenceId,
  initialSourceRequestId,
  onOpenBacklinkTarget,
}: KnowledgeDocumentDetailsProps) {
  const [query, setQuery] = useState('');
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [capturedSelection, setCapturedSelection] = useState<CapturedPageSelection | null>(null);
  // Text Phase 1. Transient toolbar state -- never persisted, always reset on
  // a new selection, a new document, or the selection going stale.
  const [selectionColor, setSelectionColor] = useState<string | null>(null);
  const [selectionRect, setSelectionRect] = useState<{ top: number; left: number; bottom: number } | null>(null);
  // One mode and one armed rectangle: two armed pages would offer two confirm
  // buttons for one intent.
  const [regionMode, setRegionMode] = useState(false);
  /** PDF-R6J-C2. The bottom bar's search popover. */
  const [searchOpen, setSearchOpen] = useState(false);
  const searchPopoverRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [armedRegion, setArmedRegion] = useState<ArmedPageRegion | null>(null);
  // P6J-F6-B4-B4. The Notes offered for one ambiguous run, or null. Transient
  // UI only -- never stored, never persisted, replaced by the next activation.
  const [targetChoice, setTargetChoice] = useState<readonly string[] | null>(null);
  /**
   * PDF-R6K-H2B-C1. The contextual rows for the highlight run last clicked, or
   * null. Transient UI only -- never stored, never persisted, replaced by the
   * next click and cleared by a delete.
   */
  const [highlightActions, setHighlightActions] =
    useState<readonly KnowledgeHighlightAction[] | null>(null);
  const activeMatchRef = useRef<HTMLElement | null>(null);
  const sourceNavigationRef = useRef<HTMLElement | null>(null);
  const scrolledSourceRequestRef = useRef<number | null>(null);
  const pagesContainerRef = useRef<HTMLDivElement | null>(null);
  // The source page is scrolled to once per request. Re-running it on every
  // render would fight the search-match scroll below, which stays authoritative
  // for whatever the reader is doing after arrival.
  const scrolledToPageRef = useRef<number | null>(null);
  const matches = useMemo(() => findMatches(pages, query), [pages, query]);
  const pageSummary = pageCountSummary(pageCount, pages.length, loading);
  // Identity is the document id, never the filename: two documents may share a
  // filename, and a name-keyed lookup would attribute one's Notes to the other.
  // Read from the board index CanvasClient owns -- no request of its own.
  const documentBacklinks = useKnowledgeSourceBacklinksForDocument(documentId);
  const documentRows = useMemo(
    () => knowledgeSourceBacklinkDocumentRows(documentBacklinks),
    [documentBacklinks],
  );
  // P6J-F6-B4-B3. The same in-memory index CanvasClient already loaded, read in
  // the other direction. No request of its own, and nothing stored: the spans
  // are derived at render time and thrown away.
  const documentSourceReferences = useKnowledgeSourceReferencesForDocument(documentId);

  /*
    PDF-R6K-H2B-C1. THE authority switch.

    Citations are still loaded above -- Used in Notes, backlinks, Open Note and
    jump-to-source all still need them -- but they no longer paint anything.
    The persistent background comes from standalone highlight rows and nothing
    else, so there is exactly one visual authority and a deleted highlight is
    actually gone.
  */
  const documentHighlights = useKnowledgeStandaloneHighlights(documentId);
  const deleteHighlight = useKnowledgeHighlightDelete();
  const highlightsById = useMemo(
    () => new Map(documentHighlights.map(
      (row): [string, KnowledgeSourceHighlight] => [String(row.id), row],
    )),
    [documentHighlights],
  );
  /** Citation id -> its Note, derived from rows the board already holds. */
  const noteTargets = useMemo(
    () => knowledgeHighlightNoteTargets(documentSourceReferences),
    [documentSourceReferences],
  );

  /**
   * Where a citation navigation should land, resolved from the CITATION's own
   * span through the shared resolver. Independent of what is painted, which is
   * what makes jump-to-source survive a deleted -- or never-created -- mark.
   */
  const citationFocus = useMemo(
    // Delegated, never resolved here: the reader has never been allowed to be
    // a second opinion on what a stored span addresses.
    () => knowledgeCitationFocusFor(
      initialSourceReferenceId === undefined
        ? null
        : documentSourceReferences.find((row) => String(row.id) === initialSourceReferenceId),
      pages,
    ),
    [initialSourceReferenceId, documentSourceReferences, pages],
  );

  // Keyed by page number rather than index so it survives reordering, and
  // deliberately independent of `query` -- typing in the search box must not
  // re-resolve every highlight on every keystroke.
  const sourceSegmentsByPage = useMemo(() => {
    const byPage = new Map<number, readonly KnowledgeReaderSegment[]>();
    for (const page of pages) {
      const focus = citationFocus !== null && citationFocus.pageNumber === page.pageNumber
        ? { start: citationFocus.start, end: citationFocus.end }
        : null;
      if (documentHighlights.length === 0 && focus === null) continue;
      byPage.set(
        page.pageNumber,
        knowledgeReaderSegments(documentHighlights, page.pageNumber, page.text, focus),
      );
    }
    return byPage;
  }, [documentHighlights, citationFocus, pages]);

  /**
   * P6J-F6-B4-B4. The Notes the reader is already telling the user cite this
   * document ARE the valid destinations. Deriving eligibility from the same
   * rows keeps one answer to "which Notes cite this": a span pointing at a post
   * the board no longer holds paints, but offers nothing to open.
   */
  const eligibleTargets = useMemo(
    () => new Set(documentRows.map((row) => row.targetPadletId)),
    [documentRows],
  );
  const targetLabels = useMemo(
    () => new Map(documentRows.map((row) => [row.targetPadletId, row.displayText])),
    [documentRows],
  );

  /**
   * Whether the requested citation resolved to anything paintable at all. The
   * value is only a trigger for the arrival effect below: the element itself
   * comes from the ref the renderer attaches, so this never carries a
   * coordinate of its own.
   */
  const requestedSourceResolved = useMemo(
    // PDF-R6K-H2B-C1: resolved from the citation, so an arrival still happens
    // when no highlight paints the passage.
    () => citationFocus !== null,
    [citationFocus],
  );

  /**
   * P6J-F9-D. The one explicitly navigated PAGE_REGION reference, or null for
   * every other citation kind -- the same eligibility C2's card crop checks,
   * applied to one named reference rather than a card's whole array.
   */
  const arrivalRegion = useMemo(() => {
    if (initialSourceReferenceId === undefined) return null;
    const reference = documentSourceReferences.find((row) => row.id === initialSourceReferenceId);
    if (!reference) return null;
    if (reference.quoteText !== null) return null;
    if (reference.charStart !== null || reference.charEnd !== null) return null;
    if (!Number.isInteger(reference.pageStart) || reference.pageStart < 1) return null;
    if (reference.pageStart !== reference.pageEnd) return null;
    const region = normalizeStorableRegion(reference.region);
    return region === null ? null : { pageNumber: reference.pageStart, region };
  }, [initialSourceReferenceId, documentSourceReferences]);

  /**
   * Re-proved against the CURRENT page text on every render, so replaced or
   * refreshed page data can never emit coordinates mapped against text that is
   * no longer on screen. Staleness degrades to "no selection", never to a wrong
   * span.
   */
  const activeSelection = useMemo(() => {
    if (capturedSelection === null) return null;
    const page = pages.find((candidate) => candidate.pageNumber === capturedSelection.pageNumber);
    if (!page) return null;
    const stillExact = page.text.slice(capturedSelection.charStart, capturedSelection.charEnd)
      === capturedSelection.selectedText;
    return stillExact ? capturedSelection : null;
  }, [capturedSelection, pages]);

  /**
   * PDF Source AI Phase 1. The endpoint's own `TEXT_ACTION_SELECTED_TEXT_MAX`
   * bound, checked here so the button fails closed WITHOUT truncating the
   * source text -- a shortened selection would no longer be the one the user
   * chose, and the endpoint would reject it anyway.
   */
  const activeSelectionOverAiLimit = activeSelection !== null
    && activeSelection.selectedText.length > TEXT_ACTION_SELECTED_TEXT_MAX;

  useEffect(() => {
    setActiveMatchIndex(0);
  }, [query]);

  // A different document is a different coordinate space entirely.
  useEffect(() => {
    setCapturedSelection(null);
    setSelectionColor(null);
    setSelectionRect(null);
    setTargetChoice(null);
    setRegionMode(false);
    setArmedRegion(null);
  }, [documentId]);

  // Re-proved against the rendered pages, as activeSelection is.
  /**
   * PDF-R6J-C2. Escape and a click outside close the search popover.
   *
   * Bound only while it is open, so the reader adds no listeners in its
   * ordinary state. The query itself is deliberately NOT cleared: reopening
   * search should show what you last looked for, which is what the permanent
   * field used to give you for free.
   */
  useEffect(() => {
    if (!searchOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSearchOpen(false);
    };
    const onPointerDown = (event: MouseEvent) => {
      const popover = searchPopoverRef.current;
      if (popover && !popover.contains(event.target as Node)) setSearchOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [searchOpen]);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  /**
   * PDF-R6J-C2. Which page the bottom bar's page actions act on.
   *
   * Region actions do NOT use this: an armed rectangle carries its own page,
   * and that stays authoritative.
   */
  const activePageNumber = useKnowledgeReaderActivePage(pagesContainerRef, pages.length, initialPageNumber);

  /**
   * PDF-R6K. The pager.
   *
   * It moves the SCROLL, it does not page a viewport: the reader stays the
   * continuous multi-page surface it has always been, and the active-page
   * observer then reports the arrival on its own. That is why there is no
   * "current page" state to keep in step here -- there is only one, and this
   * is not it.
   */
  const scrollToPage = useCallback((pageNumber: number) => {
    if (!Number.isInteger(pageNumber)) return;
    if (pageNumber < 1 || pageNumber > pages.length) return;
    const target = pagesContainerRef.current?.querySelector(`[data-page-number="${pageNumber}"]`);
    if (target instanceof HTMLElement) target.scrollIntoView?.({ block: 'start' });
  }, [pages.length]);

  const activeRegion = useMemo(() => {
    if (armedRegion === null) return null;
    return pages.some((page) => page.pageNumber === armedRegion.pageNumber) ? armedRegion : null;
  }, [armedRegion, pages]);

  useEffect(() => {
    activeMatchRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [activeMatchIndex, matches]);

  // A different request resets the latch so the same page can be targeted again.
  useEffect(() => {
    scrolledToPageRef.current = null;
  }, [initialPageNumber]);

  useEffect(() => {
    // Integer-only, which is both a correctness check and what keeps the
    // selector below free of anything that needs escaping.
    if (initialPageNumber === undefined || !Number.isInteger(initialPageNumber)) return;
    if (loading || pages.length === 0) return;
    if (scrolledToPageRef.current === initialPageNumber) return;
    // An active search is the more specific intent; let its own scroll win.
    if (matches.length > 0) return;
    const target = pagesContainerRef.current?.querySelector(
      `[data-page-number="${initialPageNumber}"]`,
    );
    // A page the document does not have simply leaves the reader where it
    // opened -- never an error, never a jump to an unrelated page.
    scrolledToPageRef.current = initialPageNumber;
    if (target instanceof HTMLElement) target.scrollIntoView?.({ block: 'start' });
  }, [initialPageNumber, loading, pages, matches.length]);

  /**
   * P6J-F6-B4-B4 exact arrival, refining the page scroll above once the
   * requested citation has actually resolved to a rendered piece.
   *
   * Latched on requestId, not on the reference or the page: clicking the same
   * source a second time is a real repeat and must scroll again, while a
   * rerender within one request must not. When nothing resolved -- a legacy
   * page-only row, a drifted quote, an id that is not on this page -- the ref
   * is empty and the B2 page arrival above is simply left as the outcome.
   */
  useEffect(() => {
    if (initialSourceRequestId === undefined) return;
    if (scrolledSourceRequestRef.current === initialSourceRequestId) return;
    if (loading || pages.length === 0) return;
    // Search is the more specific intent while it owns matches; the citation is
    // still marked, and clearing the search re-runs this.
    if (matches.length > 0) return;
    const element = sourceNavigationRef.current;
    if (!element) return;
    scrolledSourceRequestRef.current = initialSourceRequestId;
    element.scrollIntoView?.({ block: 'center' });
  }, [initialSourceRequestId, loading, pages, matches.length, requestedSourceResolved]);

  /**
   * The selection is captured when the user finishes making it, NOT when they
   * click the action: a click's own mousedown collapses the browser selection,
   * so reading it in the click handler would find nothing. Buttons are excluded
   * for the same reason -- mouseup runs before click, and consuming the
   * selection there would clear it exactly when the action is about to use it.
   */
  const settleSelectionFrom = (target: EventTarget | null) => {
    if (target instanceof Element && target.closest('button')) return;
    setCapturedSelection(captureExactSelection(pagesContainerRef.current, pages));
    // Best-effort positioning only, read separately from the pure capture
    // above: a prior color choice belongs to the selection that is ending,
    // never to whatever comes next.
    const selection = typeof window === 'undefined' ? null : window.getSelection();
    const range = selection && !selection.isCollapsed && selection.rangeCount === 1 ? selection.getRangeAt(0) : null;
    // jsdom's Range has no getBoundingClientRect at all (not even a zero
    // rect) -- guarded rather than assumed, since this is positioning only.
    setSelectionRect(range && typeof range.getBoundingClientRect === 'function' ? range.getBoundingClientRect() : null);
    setSelectionColor(null);
  };

  /**
   * A drag-selection ends wherever the pointer happens to be, which is very
   * often past the edge of the scrolling text: in the side panel the user
   * sweeps across a line and releases over the panel chrome or the board.
   * Listening only on the pages container missed exactly those releases, so
   * the first selection frequently produced no toolbar and a second one --
   * released inside the text by luck -- appeared to fix it.
   *
   * Listening on the document removes the dependency on where the pointer
   * came to rest. It widens nothing: captureExactSelection still requires
   * both endpoints inside one page text root and still fails closed, so a
   * release anywhere else simply clears the selection, which is what
   * clicking away should do anyway.
   */
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const settle = (event: Event) => settleSelectionFrom(event.target);
    document.addEventListener('mouseup', settle);
    document.addEventListener('keyup', settle);
    return () => {
      document.removeEventListener('mouseup', settle);
      document.removeEventListener('keyup', settle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages]);

  /**
   * The ONE place a selection becomes a drag payload.
   *
   * Both drag surfaces -- the grip and the highlighted text itself -- call
   * this, so they cannot drift apart in provenance or in what the board
   * ends up creating. It reads the RE-PROVED activeSelection, never a fresh
   * DOM range, so the offsets are the ones the server will verify.
   */
  const writeSelectionClipTransfer = (
    dataTransfer: DataTransfer,
    // Passed in rather than closed over: both call sites have already proved
    // the document identity, and the payload must never be built without it.
    sourceDocumentId: string,
    selection: { pageNumber: number; charStart: number; charEnd: number; selectedText: string },
  ) => {
    dataTransfer.setData(
      KNOWLEDGE_SOURCE_CLIP_MIME,
      buildKnowledgeSourceClipTransfer({
        kind: 'text',
        sourceDocumentId,
        originalFilename,
        pageNumber: selection.pageNumber,
        charStart: selection.charStart,
        charEnd: selection.charEnd,
        selectedText: selection.selectedText,
      }),
    );
    // Auxiliary hint only, on a SEPARATE type: the dedicated Knowledge
    // payload above stays exactly as it always was.
    if (selectionColor) dataTransfer.setData(KNOWLEDGE_SOURCE_CLIP_COLOR_HINT, selectionColor);
    dataTransfer.effectAllowed = 'copy';
  };

  /**
   * P6J-F8-B1. Browsers make selected text natively draggable, carrying
   * `text/plain`. Left alone that is a second, uncontrolled way to fling page
   * text at the canvas -- racing the mouseup that is the ONLY path from a
   * selection to canonical coordinates, on a type any application can forge.
   * So: the chip drags, nothing else does. Scoped to this pages container, so
   * every unrelated drag in the app is untouched.
   */
  const suppressNativePageTextDrag = (event: React.DragEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(`[${CLIP_CHIP}]`)) return;

    /**
     * Dragging the highlighted text itself is a real affordance, not a
     * second uncontrolled one: it is allowed ONLY when a re-proved exact
     * selection exists and the drag actually starts inside that range, and
     * it carries the SAME authoritative payload the grip carries. Everything
     * else in the page is still refused, so a stray paragraph can never fling
     * forgeable `text/plain` at the canvas.
     *
     * Gated on onCreateNoteFromPage exactly as the grip is, so this adds no
     * capability a viewer did not already have.
     */
    if (onCreateNoteFromPage && documentId && activeSelection && dragStartsInsideSelection(event)) {
      writeSelectionClipTransfer(event.dataTransfer, documentId, activeSelection);
      return;
    }
    event.preventDefault();
  };

  /**
   * One eligible Note opens directly; several ask, because guessing would send
   * the reader to a Note they did not mean and quietly hide the others.
   */
  const activateSourceTargets = (targets: readonly string[]) => {
    if (!onOpenBacklinkTarget || targets.length === 0) return;
    if (targets.length === 1) {
      setTargetChoice(null);
      onOpenBacklinkTarget(targets[0]);
      return;
    }
    setTargetChoice(targets);
  };

  const sourceInteraction: PageSourceInteraction = {
    navigationReferenceId: initialSourceReferenceId ?? null,
    navigationRef: sourceNavigationRef,
    eligibleTargets,
    onActivate: onOpenBacklinkTarget ? activateSourceTargets : null,
    // PDF-R6K-H2B-C1. A painted run opens its own control; the control decides
    // per highlight whether an Open Note exists behind it.
    onOpenHighlightActions: setHighlightActions,
    highlightsById,
    noteTargets,
  };

  const moveMatch = (delta: number) => {
    if (matches.length === 0) return;
    setActiveMatchIndex((current) => (current + delta + matches.length) % matches.length);
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* The document's identity belongs to whichever surface owns it. In the
          reader that is the Library panel, so the workspace starts at the
          document itself rather than repeating Back / filename / page count /
          Used in Notes above it. */}
      {hostRendersDocumentHeader ? null : (
        <>
          <button
            type="button"
            className="mb-3 text-xs font-medium text-blue-700 hover:text-blue-900"
            onClick={onBack}
          >
            ← Back to PDFs
          </button>
          <div className="mb-3 border-b border-gray-100 pb-2">
            <h2 className="truncate text-sm font-medium text-gray-800" title={originalFilename}>
              {originalFilename}
            </h2>
            {pageSummary !== null ? (
              <p className="text-[11px] text-gray-500">{pageSummary}</p>
            ) : null}
            <UsedInNotes scope="document" rows={documentRows} onOpen={onOpenBacklinkTarget} />
          </div>
        </>
      )}

      {loading ? (
        <p className="text-[11px] text-gray-500">Loading extracted text…</p>
      ) : error ? (
        <p className="text-[11px] text-gray-500">Extracted text unavailable.</p>
      ) : pages.length === 0 ? (
        <p className="text-[11px] text-gray-500">No extracted text available.</p>
      ) : (
        <div
          ref={pagesContainerRef}
          onMouseUp={(event) => settleSelectionFrom(event.target)}
          onKeyUp={(event) => settleSelectionFrom(event.target)}
          onDragStart={suppressNativePageTextDrag}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1"
        >
          {pages.map((page, pageIndex) => {
            // Only the page the selection actually lives on offers the exact
            // action; every other page keeps its ordinary one.
            const pageSelection = activeSelection?.pageNumber === page.pageNumber ? activeSelection : null;
            const pageRegion = activeRegion?.pageNumber === page.pageNumber ? activeRegion : null;
            return (
            <section key={page.pageNumber} data-page-number={page.pageNumber}>
              {/*
                PDF-R6K. No page chrome at all.
                --
                The heading and the per-page "Used in Notes" rows both restated
                what the Library panel already owns, directly above the thing
                the reader is for. The data is untouched -- documentBacklinks
                still feeds the Library's own document-scoped list, and the
                page number still rides on the section for tracking, scrolling
                and citation arrival. Only the duplicate presentation is gone,
                so the page itself starts at the top of the reader.
              */}
              {/*
                P6J-F9-A2b -- the page visual, a SIBLING of the canonical text
                root and never inside it: B4-B2B measures selection offsets
                against that paragraph's textContent, so an element within it
                would move every coordinate after itself.
              */}
              {boardId && documentId ? (
                <KnowledgeDocumentPageRegionSelector
                  boardId={boardId}
                  documentId={documentId}
                  pageNumber={page.pageNumber}
                  originalFilename={originalFilename}
                  widthPoints={page.widthPoints}
                  heightPoints={page.heightPoints}
                  rotation={page.rotation}
                  enabled={regionMode && onCreateNoteFromPage !== undefined}
                  armedRegion={pageRegion?.region ?? null}
                  highlightRegion={arrivalRegion?.pageNumber === page.pageNumber ? arrivalRegion.region : null}
                  onArm={(region, appliedRotation) =>
                    setArmedRegion({ pageNumber: page.pageNumber, region, appliedRotation })}
                  onClear={() => setArmedRegion(null)}
                />
              ) : null}
              <p
                {...{ [PAGE_TEXT_ROOT]: page.pageNumber }}
                className="select-text whitespace-pre-wrap text-xs leading-5 text-gray-700"
              >
                {highlightedText(
                  page.text,
                  matches.filter((match) => match.pageIndex === pageIndex),
                  matches[activeMatchIndex],
                  activeMatchRef,
                  sourceSegmentsByPage.get(page.pageNumber) ?? [],
                  sourceInteraction,
                  selectionColor && pageSelection
                    ? { start: pageSelection.charStart, end: pageSelection.charEnd, color: selectionColor }
                    : null,
                )}
              </p>
            </section>
            );
          })}
        </div>
      )}

      {/*
        The document-working toolbar: search, area selection and where you are
        in the document, collected at the foot of the workspace instead of
        stacked above the text. Every control here drives an EXISTING function
        -- there is no zoom, because the reader has no zoom to expose, and a
        control that did nothing would be worse than its absence.
      */}
      <div
        data-knowledge-viewer-toolbar="true"
        className="mt-2 flex flex-none items-center gap-1 border-t border-gray-100 pt-2"
      >
        {/*
          PDF-R6J-C2. Search is an icon with a popover instead of a permanent
          field. The field was the widest thing in the reader and was present
          whether or not anyone was searching; the popover opens UPWARD because
          this bar sits at the foot of the reader and there is nothing below it.

          The search itself is untouched -- same query state, same matching,
          same navigation -- and the query survives closing, so reopening shows
          what you last looked for, exactly as the permanent field did.
        */}
        <div className="relative flex-none" ref={searchPopoverRef}>
          <button
            type="button"
            data-knowledge-viewer-action="search"
            aria-label="Search this PDF"
            aria-expanded={searchOpen}
            title="Search this PDF"
            className={`${KNOWLEDGE_ICON_BUTTON_CLASS}${query ? ' border-blue-300 bg-blue-50 text-blue-700' : ''}`}
            onClick={() => setSearchOpen((open) => !open)}
          >
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          {searchOpen ? (
            <div
              data-knowledge-search-popover="true"
              className="absolute bottom-full left-0 z-20 mb-2 w-[280px] rounded-md border border-gray-200 bg-white p-2 shadow-lg"
            >
              <input
                ref={searchInputRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Search in this PDF…"
                aria-label="Search in this PDF"
                className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
              />
              {query ? (
                <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-gray-500">
                  <span>{matches.length === 0 ? 'No matches' : `${matches.length} ${matches.length === 1 ? 'match' : 'matches'}`}</span>
                  {matches.length > 1 ? (
                    <>
                      <button type="button" className="underline hover:text-gray-900" onClick={() => moveMatch(-1)}>Previous</button>
                      <button type="button" className="underline hover:text-gray-900" onClick={() => moveMatch(1)}>Next</button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {/*
          PDF-R6J-C2. The page actions, moved down from the page headers.
          They act on the page the reader is actually showing -- see
          useKnowledgeReaderActivePage, which exists only because
          consolidating these buttons removed the old answer (which button you
          pressed named the page).
        */}
        {onCreateNoteFromPage && documentId && pages.length > 0 && !activeSelection ? (
          <button
            type="button"
            data-knowledge-viewer-action="create-note"
            aria-label={`Create Note from page ${activePageNumber}`}
            title="Create Note"
            className={KNOWLEDGE_ICON_BUTTON_CLASS}
            onClick={() => onCreateNoteFromPage({
              // The document's real identity, never its filename.
              sourceDocumentId: documentId,
              originalFilename,
              pageNumber: activePageNumber,
              pageText: pages.find((page) => page.pageNumber === activePageNumber)?.text ?? '',
              selection: null,
            })}
          >
            <StickyNote className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}

        {onAddBoardAiContext && documentId && pages.length > 0 && !activeSelection ? (
          <button
            type="button"
            data-knowledge-viewer-action="add-to-chat"
            data-knowledge-page-add-to-chat={activePageNumber}
            aria-label={`Add page ${activePageNumber} to Board AI`}
            title="Add page to Board AI"
            className={KNOWLEDGE_ICON_BUTTON_CLASS}
            onClick={() => onAddBoardAiContext(
              boardAiDraftFromPage(documentId, originalFilename, activePageNumber),
            )}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}

        {/* P6J-F9-B2. ONE mode, off by default: always-on image dragging would
            fight the reader's own vertical scrolling. Editor-only, exactly as
            before -- a viewer never sees it. */}
        {onCreateNoteFromPage && documentId ? (
          <button
            type="button"
            aria-pressed={regionMode}
            data-knowledge-viewer-action="select-area"
            title="Select area"
            aria-label="Select area"
            className={`${KNOWLEDGE_ICON_BUTTON_CLASS}${regionMode ? ' border-blue-300 bg-blue-50 text-blue-700' : ''}`}
            // Leaving the mode abandons whatever was drawn in it. Entering it
            // drops any captured text-selection toolbar state so the text
            // toolbar (and its AI activation) can never coexist with an armed
            // region -- the same exclusivity the AI toolbar gate asserts.
            onClick={() => {
              setRegionMode((current) => {
                const next = !current;
                if (next) {
                  setCapturedSelection(null);
                  setSelectionColor(null);
                  setSelectionRect(null);
                }
                return next;
              });
              setArmedRegion(null);
            }}
          >
            <Crop className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}

        {/* PDF-R6J. The armed rectangle's own actions, moved down from above
            the page. They are gated exactly as they were -- the same
            onCreateNoteFromPage capability and the same "only while a region
            is armed" rule -- and act on the page the region itself names, so
            nothing here guesses at a current page. */}
        {onCreateNoteFromPage && documentId && activeRegion ? (
          <>
            <button
              type="button"
              data-knowledge-viewer-action="note-from-area"
              aria-label={`Create Note from selected area on page ${activeRegion.pageNumber}`}
              title="Create Note from area"
              className={`${KNOWLEDGE_ICON_BUTTON_CLASS} border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-900`}
              onClick={() => {
                onCreateNoteFromPage({
                  sourceDocumentId: documentId,
                  originalFilename,
                  pageNumber: activeRegion.pageNumber,
                  // Empty by design, as the F8 clip path does: a region quotes
                  // nothing, and passing the text would leave a page snapshot
                  // one branch away from a rectangle nobody read it from.
                  pageText: '',
                  selection: null,
                  region: {
                    region: activeRegion.region,
                    appliedRotation: activeRegion.appliedRotation,
                  },
                });
                setArmedRegion(null);
                setRegionMode(false);
              }}
            >
              <SquareDashedMousePointer className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              data-knowledge-viewer-action="clear-area"
              aria-label={`Clear selected area on page ${activeRegion.pageNumber}`}
              title="Clear selection"
              className={KNOWLEDGE_ICON_BUTTON_CLASS}
              onClick={() => setArmedRegion(null)}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </>
        ) : null}

        {/*
          PDF-R6K. Where you are, and how to move.
          --
          Counted from the pages actually rendered, never a stored guess. The
          arrows move the scroll and let the observer report the arrival, so
          the reader stays a continuous scrolling surface rather than becoming
          a one-page-at-a-time viewer.
        */}
        {pages.length > 0 ? (
          <div className="ml-auto flex flex-none items-center gap-0.5">
            <button
              type="button"
              data-knowledge-viewer-action="previous-page"
              aria-label="Previous page"
              title="Previous page"
              disabled={activePageNumber <= 1}
              className={KNOWLEDGE_ICON_BUTTON_CLASS}
              onClick={() => scrollToPage(activePageNumber - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <span
              data-knowledge-viewer-page-indicator="true"
              className="px-1 text-[11px] tabular-nums text-gray-500"
            >
              {activePageNumber} / {pages.length}
            </span>
            <button
              type="button"
              data-knowledge-viewer-action="next-page"
              aria-label="Next page"
              title="Next page"
              disabled={activePageNumber >= pages.length}
              className={KNOWLEDGE_ICON_BUTTON_CLASS}
              onClick={() => scrollToPage(activePageNumber + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>

      {/*
        Text Phase 1 -- the ONE floating selection toolbar, a SIBLING of the
        pages container and every page text root, exactly like the source-
        choice panel below: it must contribute zero characters to any page's
        canonical textContent. Positioned via the rect captured at mouseup,
        not from a live selection -- pressing a button here would otherwise
        collapse the very selection it is acting on.
      */}
      {(onCreateNoteFromPage || onAddBoardAiContext) && documentId && activeSelection && !regionMode ? (
        <div
          data-knowledge-selection-toolbar="true"
          style={selectionRect
            ? {
              position: 'fixed',
              left: Math.max(8, selectionRect.left),
              top: selectionRect.top > 56 ? selectionRect.top - 44 : selectionRect.bottom + 8,
              zIndex: 50,
            }
            : { display: 'none' }}
          className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-1.5 py-1 shadow-lg"
        >
          {onCreateNoteFromPage ? (
          <button
            type="button"
            {...{ [CLIP_CHIP]: 'true' }}
            draggable
            aria-label="Drag selected PDF text to the canvas"
            title="Drag selected PDF text to the canvas"
            className="cursor-grab rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 active:cursor-grabbing focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400"
            onDragStart={(event) => {
              // The CAPTURED selection, never window.getSelection(): pressing
              // this control collapses the browser range, so reading it live
              // would find nothing exactly when needed.
              writeSelectionClipTransfer(event.dataTransfer, documentId, activeSelection);
            }}
          >
            <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          ) : null}
          {onCreateNoteFromPage ? (
          <button
            type="button"
            aria-label={`Create Note from selection on page ${activeSelection.pageNumber}`}
            className="rounded px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
            onClick={() => onCreateNoteFromPage(
              buildSelectionSourceRequest(documentId, originalFilename, pages, activeSelection, selectionColor),
            )}
          >
            Note Post
          </button>
          ) : null}
          <button
            type="button"
            aria-label="Copy selected text"
            className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
            onClick={() => { void navigator.clipboard?.writeText?.(activeSelection.selectedText); }}
          >
            Copy
          </button>
          {onAddBoardAiContext ? (
            <button
              type="button"
              data-knowledge-selection-add-to-chat="true"
              aria-label="Use the selected text in Board AI"
              title="Use in Board AI"
              className="rounded px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
              onClick={() => {
                // The reader's OWN re-proved span, passed through untouched.
                // Recomputing it from the DOM here would produce a second
                // provenance authority that could disagree with the first.
                const draft = boardAiDraftFromSelection(documentId, originalFilename, {
                  pageNumber: activeSelection.pageNumber,
                  charStart: activeSelection.charStart,
                  charEnd: activeSelection.charEnd,
                  selectedText: activeSelection.selectedText,
                });
                if (draft) onAddBoardAiContext(draft);
              }}
            >
              Use in Board AI
            </button>
          ) : null}
          {onAiFromSelection ? (
            <button
              type="button"
              aria-label="Ask AI about the selected text"
              title={activeSelectionOverAiLimit ? 'AI supports selections up to 4,000 characters' : undefined}
              disabled={activeSelectionOverAiLimit}
              // lg-only: the right pane the button opens is itself hidden below
              // lg, so a visible-but-dead control below that width would be
              // worse than no control at all.
              className="hidden items-center gap-1 rounded px-2 py-1 text-xs font-medium text-purple-700 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-40 lg:inline-flex"
              onClick={() => {
                if (activeSelectionOverAiLimit) return;
                onAiFromSelection(
                  buildSelectionSourceRequest(documentId, originalFilename, pages, activeSelection, selectionColor),
                );
              }}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              AI
            </button>
          ) : null}
          <div className="mx-1 h-4 w-px bg-gray-200" aria-hidden="true" />
          {KNOWLEDGE_SOURCE_NOTE_TOP_STRIP_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Highlight color ${color}`}
              aria-pressed={selectionColor === color}
              className={`h-4 w-4 shrink-0 rounded-full border ${selectionColor === color ? 'ring-2 ring-offset-1 ring-gray-400' : 'border-gray-300'}`}
              style={{ backgroundColor: color }}
              onClick={() => setSelectionColor((current) => (current === color ? null : color))}
            />
          ))}
        </div>
      ) : null}

      {/*
        Deliberately OUTSIDE the pages container, and therefore outside every
        page text root: B4-B2B measures selection offsets against that text, so
        no affordance may add a character to it. Identity is the padlet id on
        each control -- the label is presentation and opens nothing.
      */}
      {/*
        PDF-R6K-H2B-C1. The highlight's own control, and deliberately in the
        same place as the choice list above: OUTSIDE the pages container, so
        B4-B2B's selection offsets -- measured against the page text root --
        cannot be shifted by a character of affordance.

        One row per covering highlight, each carrying its own durable id. Open
        Note appears only where that highlight still has a live citation; Trash
        only where the board wired a delete authority, which it withholds from
        a viewer. RLS remains the actual boundary either way.
      */}
      {highlightActions && highlightActions.length > 0 ? (
        <div className="mt-3">
          <KnowledgeHighlightActions
            actions={highlightActions}
            onOpenNote={onOpenBacklinkTarget ?? null}
            onDelete={deleteHighlight}
            onDismiss={() => setHighlightActions(null)}
          />
        </div>
      ) : null}

      {targetChoice && onOpenBacklinkTarget ? (
        <div
          data-knowledge-source-choice="true"
          className="mt-3 rounded-md border border-gray-200 bg-white p-2 shadow-sm"
        >
          <p className="text-[11px] font-medium text-gray-500">Open citing Note</p>
          <ul className="mt-1 space-y-0.5">
            {targetChoice.map((targetPadletId) => (
              <li key={targetPadletId}>
                <button
                  type="button"
                  data-knowledge-source-choice-target={targetPadletId}
                  onClick={() => {
                    setTargetChoice(null);
                    onOpenBacklinkTarget(targetPadletId);
                  }}
                  className="block w-full truncate rounded px-2 text-left text-[11px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-300"
                >
                  {targetLabels.get(targetPadletId) ?? 'Note'}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            aria-label="Dismiss citing Notes"
            onClick={() => setTargetChoice(null)}
            className="mt-1 px-2 text-[11px] text-gray-500 underline underline-offset-2 hover:text-gray-800"
          >
            Dismiss
          </button>
        </div>
      ) : null}
    </div>
  );
}
