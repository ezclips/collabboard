"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  KnowledgeSourcePageRequest,
  KnowledgeSourceTextSelection,
} from '@/lib/domain/knowledge/knowledgeSourceNoteDraft';
import { MAX_SOURCE_REFERENCE_QUOTE_LENGTH } from '@/lib/domain/knowledge/knowledgeSourceReferenceWrite';
import {
  KNOWLEDGE_SOURCE_CLIP_MIME,
  buildKnowledgeSourceClipTransfer,
} from '@/lib/domain/knowledge/knowledgeSourceClipPayload';
import {
  useKnowledgeSourceBacklinksForDocument,
  useKnowledgeSourceNoteColors,
  useKnowledgeSourceReferencesForDocument,
} from '@/components/collabboard/KnowledgeSourceReferenceContext';
import KnowledgeDocumentPageRegionSelector from '@/components/collabboard/KnowledgeDocumentPageRegionSelector';
import type { KnowledgePageRotation, NormalizedPageRegion }
  from '@/lib/domain/knowledge/knowledgePageRegionGeometry';
import { knowledgeSourceHighlightColor } from '@/lib/domain/knowledge/knowledgeSourceHighlightColor';
import type { KnowledgeSourceNoteColors } from '@/lib/domain/knowledge/knowledgeSourceHighlightColor';
import { knowledgeSourceHighlightSegments } from '@/lib/domain/knowledge/knowledgeSourceHighlights';
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
   * Absent for readers who cannot create posts on this board. The action is
   * then not rendered at all rather than rendered disabled -- the same
   * capability the canvas toolbar itself is gated on decides this.
   */
  onCreateNoteFromPage?: (request: KnowledgeSourcePageRequest) => void;
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
   * P6J-F8-B3 -- the board's Note colours. Empty means every highlight keeps
   * its neutral sky styling, which is also what a non-canvas surface gets.
   */
  readonly noteColors: KnowledgeSourceNoteColors;
}

type TextMatch = { pageIndex: number; start: number; end: number };

/**
 * P6J-F6-B4-B2B. One page's captured browser selection, already proved against
 * that page's canonical text. Transient UI state only: it is never persisted,
 * never put in the URL, never sent to Supabase, and never highlight geometry.
 */
type CapturedPageSelection = KnowledgeSourceTextSelection & { readonly pageNumber: number };

/** Marks the one element whose text is the exact-span coordinate space. */
/** P6J-F9-B2. The reader's ONE armed rectangle, already in SOURCE coordinates. */
interface ArmedPageRegion {
  readonly pageNumber: number;
  readonly region: NormalizedPageRegion;
  readonly appliedRotation: KnowledgePageRotation;
}

const PAGE_TEXT_ROOT = 'data-knowledge-page-text-root';

/**
 * P6J-F8-B1. The one element allowed to start a Knowledge drag. Everything
 * else inside the reader -- the page text above all -- is suppressed below, so
 * this attribute is what the suppression handler tests for.
 */
const CLIP_CHIP = 'data-knowledge-clip-chip';

function pageTextRootOf(node: Node | null, container: HTMLElement): HTMLElement | null {
  const element = node instanceof Element ? node : node?.parentElement ?? null;
  const root = element?.closest(`[${PAGE_TEXT_ROOT}]`) ?? null;
  // Inside this reader, and inside a page paragraph -- headings, labels,
  // buttons and backlink rows are not part of any coordinate space.
  return root instanceof HTMLElement && container.contains(root) ? root : null;
}

/**
 * Maps a DOM Range onto page-relative UTF-16 offsets, and refuses anything it
 * cannot prove.
 *
 * The local search renderer splits a page across plain text nodes and <mark>
 * elements, so Range.startOffset/endOffset are NODE-local and meaningless as
 * page coordinates. Measuring a range that begins at the paragraph's own start
 * is what makes the result page-relative, and `String.length` is UTF-16 by
 * definition -- a surrogate pair counts as the two units the server indexes by.
 */
function captureExactSelection(
  container: HTMLElement | null,
  pages: readonly KnowledgeDocumentDetailPage[],
): CapturedPageSelection | null {
  if (!container) return null;
  const selection = typeof window === 'undefined' ? null : window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return null;
  // Always ordered start-to-end, so a backwards drag yields the same range.
  const range = selection.getRangeAt(0);
  if (range.collapsed) return null;

  // BOTH endpoints must sit in the SAME page. A cross-page or partly-outside
  // selection is not an exact span and is never salvaged into one.
  const root = pageTextRootOf(range.startContainer, container);
  if (root === null || pageTextRootOf(range.endContainer, container) !== root) return null;

  const pageNumber = Number(root.getAttribute(PAGE_TEXT_ROOT));
  const page = pages.find((candidate) => candidate.pageNumber === pageNumber);
  if (!page) return null;
  // Fail closed if anything visible was injected into the paragraph: the
  // offsets below index this exact string and nothing else.
  if (root.textContent !== page.text) return null;

  const measure = root.ownerDocument.createRange();
  measure.selectNodeContents(root);
  measure.setEnd(range.startContainer, range.startOffset);
  const charStart = measure.toString().length;
  // Defensive, not a fix: `setEnd` moves `start` only when the new end precedes
  // it, and this range always starts at the paragraph while both boundaries lie
  // inside it -- so the hazard cannot arise here. Re-anchoring keeps the two
  // measurements independent of each other regardless.
  measure.selectNodeContents(root);
  measure.setEnd(range.endContainer, range.endOffset);
  const charEnd = measure.toString().length;
  const selectedText = range.toString();

  // Half-open [start, end), inside the page, and not empty.
  if (charStart < 0 || charStart >= charEnd || charEnd > page.text.length) return null;
  // Refused here rather than sent and rejected: the server caps the quote too.
  if (selectedText.length > MAX_SOURCE_REFERENCE_QUOTE_LENGTH) return null;
  // The check that matters. The coordinates must already describe exactly what
  // the user selected, with no trimming or normalisation on either side --
  // the server repeats this comparison against its own stored page.
  if (page.text.slice(charStart, charEnd) !== selectedText) return null;
  return { pageNumber, charStart, charEnd, selectedText };
}

/**
 * A source opened from a semantic result arrives with no pageCount, so counting
 * the not-yet-loaded pages would claim "0 pages" about a document we simply have
 * not read yet. Absent knowledge is rendered as no claim at all.
 */
function pageCountSummary(pageCount: number | null, pageLength: number, loading: boolean): string | null {
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

/** Distinct citations overlapping a run, by real reference id. */
function sourceCountOver(
  segments: readonly KnowledgeSourceHighlightSegment[],
  start: number,
  end: number,
): number {
  const ids = new Set<string>();
  for (const segment of segments) {
    if (segment.end <= start || segment.start >= end) continue;
    for (const span of segment.spans) ids.add(span.referenceId);
  }
  return ids.size;
}

/**
 * The distinct Notes a run cites, in the spans' own deterministic order, kept
 * only where the Note is currently listed as citing this document. A span whose
 * target is not in that set still paints -- it just offers no action, because
 * there is nothing on the board to open.
 */
function eligibleTargetsOf(
  segment: KnowledgeSourceHighlightSegment,
  eligible: ReadonlySet<string>,
): readonly string[] {
  const targets: string[] = [];
  for (const span of segment.spans) {
    if (!eligible.has(span.targetPadletId)) continue;
    // Two citations of one Note are one destination, not two.
    if (!targets.includes(span.targetPadletId)) targets.push(span.targetPadletId);
  }
  return targets;
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
  sourceSegments: readonly KnowledgeSourceHighlightSegment[],
  interaction: PageSourceInteraction,
) {
  const nodes: React.ReactNode[] = [];
  // The arrival ref belongs on the FIRST piece of the requested citation; the
  // rest share its emphasis but must not steal the scroll.
  let navigationAnchored = false;

  // Outside a search match the citations decide the cuts.
  const pushUnmatched = (start: number, end: number) => {
    if (end <= start) return;
    if (sourceSegments.length === 0) {
      nodes.push(<React.Fragment key={`text-${start}`}>{text.slice(start, end)}</React.Fragment>);
      return;
    }
    for (const segment of sourceSegments) {
      const from = Math.max(segment.start, start);
      const to = Math.min(segment.end, end);
      if (from >= to) continue;
      const piece = text.slice(from, to);
      if (segment.spans.length === 0) {
        nodes.push(<React.Fragment key={`text-${from}`}>{piece}</React.Fragment>);
        continue;
      }
      const isArrival = interaction.navigationReferenceId !== null
        && segment.spans.some((span) => span.referenceId === interaction.navigationReferenceId);
      const anchorHere = isArrival && !navigationAnchored;
      if (anchorHere) navigationAnchored = true;

      const targets = interaction.onActivate === null
        ? []
        : eligibleTargetsOf(segment, interaction.eligibleTargets);
      const activate = targets.length === 0 || interaction.onActivate === null
        ? null
        : () => {
          // A click that ends a drag-selection is the user selecting text, not
          // asking to navigate. Read ONLY to suppress: no offset and no
          // identity is ever derived from the live selection here -- B4-B2B
          // remains the single path from a selection to coordinates.
          const selection = typeof window === 'undefined' ? null : window.getSelection();
          if (selection && !selection.isCollapsed) return;
          interaction.onActivate!(targets);
        };

      // P6J-F8-B3. The domain resolver owns every rule -- validity, default
      // white, and disagreement between the Notes covering this run. A null
      // simply leaves the neutral class below untouched.
      const tint = knowledgeSourceHighlightColor(segment.spans, interaction.noteColors);

      nodes.push(
        <span
          key={`source-${from}`}
          ref={anchorHere ? interaction.navigationRef : undefined}
          style={tint ? { backgroundColor: tint.backgroundColor } : undefined}
          data-knowledge-source-highlight="true"
          data-knowledge-source-highlight-count={segment.spans.length}
          data-knowledge-source-navigation-target={isArrival ? 'true' : undefined}
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
            // The tint replaces the neutral background and nothing else: the
            // arrival ring is navigation feedback, not decoration, so a
            // coloured Note must never cost the reader its "you are here".
            tint ? '' : (isArrival ? 'bg-sky-200' : 'bg-sky-100'),
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
function UsedInNotes({ scope, rows, onOpen }: {
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
  pages,
  loading,
  error,
  onBack,
  onCreateNoteFromPage,
  initialPageNumber,
  initialSourceReferenceId,
  initialSourceRequestId,
  onOpenBacklinkTarget,
}: KnowledgeDocumentDetailsProps) {
  const [query, setQuery] = useState('');
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [capturedSelection, setCapturedSelection] = useState<CapturedPageSelection | null>(null);
  // One mode and one armed rectangle: two armed pages would offer two confirm
  // buttons for one intent.
  const [regionMode, setRegionMode] = useState(false);
  const [armedRegion, setArmedRegion] = useState<ArmedPageRegion | null>(null);
  // P6J-F6-B4-B4. The Notes offered for one ambiguous run, or null. Transient
  // UI only -- never stored, never persisted, replaced by the next activation.
  const [targetChoice, setTargetChoice] = useState<readonly string[] | null>(null);
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
  // P6J-F8-B3 -- read-only Note colours, already derived by the board's owner.
  const noteColors = useKnowledgeSourceNoteColors();
  // Keyed by page number rather than index so it survives reordering, and
  // deliberately independent of `query` -- typing in the search box must not
  // re-resolve every citation on every keystroke.
  const sourceSegmentsByPage = useMemo(() => {
    const byPage = new Map<number, readonly KnowledgeSourceHighlightSegment[]>();
    if (documentSourceReferences.length === 0) return byPage;
    for (const page of pages) {
      byPage.set(page.pageNumber, knowledgeSourceHighlightSegments(documentSourceReferences, page.pageNumber, page.text));
    }
    return byPage;
  }, [documentSourceReferences, pages]);

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
  const requestedSourceResolved = useMemo(() => {
    if (initialSourceReferenceId === undefined) return false;
    for (const segments of sourceSegmentsByPage.values()) {
      for (const segment of segments) {
        if (segment.spans.some((span) => span.referenceId === initialSourceReferenceId)) return true;
      }
    }
    return false;
  }, [initialSourceReferenceId, sourceSegmentsByPage]);

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

  useEffect(() => {
    setActiveMatchIndex(0);
  }, [query]);

  // A different document is a different coordinate space entirely.
  useEffect(() => {
    setCapturedSelection(null);
    setTargetChoice(null);
    setRegionMode(false);
    setArmedRegion(null);
  }, [documentId]);

  // Re-proved against the rendered pages, as activeSelection is.
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
  const handleSelectionSettled = (event: React.SyntheticEvent) => {
    if (event.target instanceof Element && event.target.closest('button')) return;
    setCapturedSelection(captureExactSelection(pagesContainerRef.current, pages));
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
    noteColors,
  };

  const moveMatch = (delta: number) => {
    if (matches.length === 0) return;
    setActiveMatchIndex((current) => (current + delta + matches.length) % matches.length);
  };

  return (
    <div className="min-w-0">
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

      <div className="mb-3">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Search in this PDF…"
          aria-label="Search in this PDF"
          className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
        />
        {query ? (
          <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-500">
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

      {/* P6J-F9-B2. ONE mode, off by default: always-on image dragging would
          fight the reader's own vertical scrolling. */}
      {onCreateNoteFromPage && documentId ? (
        <div className="mb-2">
          <button
            type="button"
            aria-pressed={regionMode}
            className={`rounded border px-1.5 py-0.5 text-[11px] ${regionMode
              ? 'border-blue-300 bg-blue-50 text-blue-700'
              : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            // Leaving the mode abandons whatever was drawn in it.
            onClick={() => { setRegionMode((current) => !current); setArmedRegion(null); }}
          >
            Select area
          </button>
        </div>
      ) : null}

      {loading ? (
        <p className="text-[11px] text-gray-500">Loading extracted text…</p>
      ) : error ? (
        <p className="text-[11px] text-gray-500">Extracted text unavailable.</p>
      ) : pages.length === 0 ? (
        <p className="text-[11px] text-gray-500">No extracted text available.</p>
      ) : (
        <div
          ref={pagesContainerRef}
          onMouseUp={handleSelectionSettled}
          onKeyUp={handleSelectionSettled}
          onDragStart={suppressNativePageTextDrag}
          className="max-h-[60vh] space-y-4 overflow-y-auto pr-1"
        >
          {pages.map((page, pageIndex) => {
            // Only the page the selection actually lives on offers the exact
            // action; every other page keeps its ordinary one.
            const pageSelection = activeSelection?.pageNumber === page.pageNumber ? activeSelection : null;
            const pageRegion = activeRegion?.pageNumber === page.pageNumber ? activeRegion : null;
            return (
            <section key={page.pageNumber} data-page-number={page.pageNumber}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-[11px] font-semibold text-gray-500">Page {page.pageNumber}</h3>
                  {/* Citations covering THIS page (pageStart <= n <= pageEnd). */}
                  <UsedInNotes
                    scope="page"
                    rows={knowledgeSourceBacklinkPageRows(documentBacklinks, page.pageNumber)}
                    onOpen={onOpenBacklinkTarget}
                  />
                </div>
                <div className="flex shrink-0 items-center gap-1">
                {/*
                  P6J-F8-B1 -- the source clip chip. Rendered HERE, in the page
                  header, and never inside the paragraph below: B4-B2B measures
                  selection offsets against that paragraph's textContent, so a
                  control living in it would add characters and move every
                  coordinate after itself.

                  It appears only for a selection this page owns, and
                  `pageSelection` is `activeSelection` -- already re-proved
                  against the current page text on every render. A page whose
                  text changed under a stale selection loses its chip rather
                  than keeping a draggable payload nobody can honour.
                */}
                {onCreateNoteFromPage && documentId && pageSelection ? (
                  <button
                    type="button"
                    {...{ [CLIP_CHIP]: 'true' }}
                    draggable
                    aria-label={`Drag source clip from page ${page.pageNumber} to the canvas, or activate to create a Note`}
                    className="shrink-0 cursor-grab rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700 hover:bg-blue-100 hover:text-blue-900 active:cursor-grabbing focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400"
                    onDragStart={(event) => {
                      // The CAPTURED selection, never window.getSelection():
                      // pressing this control collapses the browser range, so
                      // reading it live would find nothing exactly when needed.
                      event.dataTransfer.setData(
                        KNOWLEDGE_SOURCE_CLIP_MIME,
                        buildKnowledgeSourceClipTransfer({
                          kind: 'text',
                          sourceDocumentId: documentId,
                          originalFilename,
                          pageNumber: pageSelection.pageNumber,
                          charStart: pageSelection.charStart,
                          charEnd: pageSelection.charEnd,
                          selectedText: pageSelection.selectedText,
                        }),
                      );
                      event.dataTransfer.effectAllowed = 'copy';
                    }}
                    // Click and keyboard activation take the EXISTING selection
                    // path: the drag adds an affordance, not a second creator.
                    onClick={() => onCreateNoteFromPage({
                      sourceDocumentId: documentId,
                      originalFilename,
                      pageNumber: page.pageNumber,
                      pageText: page.text,
                      selection: {
                        charStart: pageSelection.charStart,
                        charEnd: pageSelection.charEnd,
                        selectedText: pageSelection.selectedText,
                      },
                    })}
                  >
                    Source clip
                  </button>
                ) : null}
                {onCreateNoteFromPage && documentId ? (
                  <button
                    type="button"
                    aria-label={pageSelection
                      ? `Create Note from selection on page ${page.pageNumber}`
                      : `Create Note from page ${page.pageNumber}`}
                    className="shrink-0 rounded border border-gray-200 px-1.5 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    onClick={() => onCreateNoteFromPage({
                      // The document's real identity, never its filename.
                      sourceDocumentId: documentId,
                      originalFilename,
                      pageNumber: page.pageNumber,
                      pageText: page.text,
                      // Read from validated state, never from the browser here.
                      selection: pageSelection === null ? null : {
                        charStart: pageSelection.charStart,
                        charEnd: pageSelection.charEnd,
                        selectedText: pageSelection.selectedText,
                      },
                    })}
                  >
                    {pageSelection ? 'Create Note from selection' : 'Create Note'}
                  </button>
                ) : null}
                {/* Only for the page owning the armed rectangle, the F8 clip
                    chip's rule, in the same cluster: no new toolbar. */}
                {onCreateNoteFromPage && documentId && pageRegion ? (
                  <>
                    <button
                      type="button"
                      aria-label={`Create Note from selected area on page ${page.pageNumber}`}
                      className="shrink-0 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700 hover:bg-blue-100 hover:text-blue-900"
                      onClick={() => {
                        onCreateNoteFromPage({
                          sourceDocumentId: documentId,
                          originalFilename,
                          pageNumber: page.pageNumber,
                          // Empty by design, as the F8 clip path does: a region
                          // quotes nothing, and passing the text would leave a
                          // page snapshot one branch away from a rectangle
                          // nobody read it from.
                          pageText: '',
                          selection: null,
                          region: {
                            region: pageRegion.region,
                            appliedRotation: pageRegion.appliedRotation,
                          },
                        });
                        setArmedRegion(null);
                        setRegionMode(false);
                      }}
                    >
                      Create Note from area
                    </button>
                    <button
                      type="button"
                      aria-label={`Clear selected area on page ${page.pageNumber}`}
                      className="shrink-0 rounded border border-gray-200 px-1.5 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      onClick={() => setArmedRegion(null)}
                    >
                      Clear
                    </button>
                  </>
                ) : null}
                </div>
              </div>
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
                )}
              </p>
            </section>
            );
          })}
        </div>
      )}

      {/*
        Deliberately OUTSIDE the pages container, and therefore outside every
        page text root: B4-B2B measures selection offsets against that text, so
        no affordance may add a character to it. Identity is the padlet id on
        each control -- the label is presentation and opens nothing.
      */}
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
