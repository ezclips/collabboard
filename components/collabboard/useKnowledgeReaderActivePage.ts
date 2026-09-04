import { useEffect, useState } from 'react';

/**
 * PDF-R6J-C2 -- which page the reader is currently on.
 *
 * The reader deliberately had no such notion: every page action lived in its
 * own page header, so the page was named by WHICH button you pressed and
 * nothing had to be inferred. Consolidating those actions into one bottom
 * toolbar removes that answer, so it has to be derived -- and derived honestly,
 * because getting it wrong means a note made from, or a Board AI context added
 * from, a page the user was not looking at.
 *
 * It stays an invisible implementation detail: no active-page mode, no extra
 * selection UI, and no change to how the reader scrolls or renders. The REGION
 * actions do not use it at all -- an armed rectangle already carries its own
 * page, and that stays authoritative.
 */

export interface PageVisibility {
  readonly pageNumber: number;
  /** How much of the page is inside the reader viewport, 0..1. */
  readonly ratio: number;
}

/**
 * The page the reader is most plainly showing.
 *
 * Ties break toward the LOWER page number, which is what reading order means
 * when two pages are equally visible: the one you are coming from, not the one
 * you are arriving at. A candidate list with nothing visible keeps the previous
 * answer rather than jumping to page 1 -- during a fast scroll the observer can
 * momentarily report nothing at all.
 */
export function pickMostVisiblePage(
  candidates: readonly PageVisibility[],
  previous: number,
): number {
  let best: PageVisibility | null = null;
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate.ratio) || candidate.ratio <= 0) continue;
    if (best === null
      || candidate.ratio > best.ratio
      || (candidate.ratio === best.ratio && candidate.pageNumber < best.pageNumber)) {
      best = candidate;
    }
  }
  return best?.pageNumber ?? previous;
}

/**
 * Tracks the most visible `[data-page-number]` inside `scrollRoot`.
 *
 * Returns 1 until something is observed, which is also the answer for a reader
 * that has not been scrolled. Degrades to that fixed answer where
 * IntersectionObserver does not exist rather than failing: a slightly stale
 * page is recoverable, a crash in the reader is not.
 */
export function useKnowledgeReaderActivePage(
  scrollRoot: React.RefObject<HTMLElement | null>,
  pageCount: number,
  /**
   * Where the reader was opened, when it was opened at a page. Following a
   * citation into page 7 and then pressing Create Note must mean page 7, not
   * page 1 -- the observer agrees a moment later, but the first press should
   * not have to wait for it.
   */
  initialPage = 1,
): number {
  const [activePage, setActivePage] = useState(initialPage);

  useEffect(() => {
    if (!Number.isInteger(initialPage) || initialPage < 1) return;
    // The seed arrives before the pages do, so this runs again once the count
    // is known. A page the document does not have leaves the reader at the
    // start -- NOT at the last page, which is what a plain clamp would do and
    // would look like a deliberate jump to the end.
    if (pageCount > 0 && initialPage > pageCount) {
      setActivePage(1);
      return;
    }
    setActivePage(initialPage);
  }, [initialPage, pageCount]);

  useEffect(() => {
    const root = scrollRoot.current;
    if (!root || pageCount <= 0) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const sections = Array.from(root.querySelectorAll('[data-page-number]'));
    if (sections.length === 0) return;

    // One ratio per page, updated in place: the observer only reports what
    // CHANGED, so a running record is the only way to compare all pages.
    const ratios = new Map<number, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pageNumber = Number(entry.target.getAttribute('data-page-number'));
          if (Number.isFinite(pageNumber)) ratios.set(pageNumber, entry.intersectionRatio);
        }
        const candidates = [...ratios].map(([pageNumber, ratio]) => ({ pageNumber, ratio }));
        setActivePage((previous) => pickMostVisiblePage(candidates, previous));
      },
      { root, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [scrollRoot, pageCount]);

  /**
   * Clamped on the way out, not on the way in.
   *
   * The seed arrives before the pages do, so a citation pointing past the end
   * -- a stale link, a shortened document -- would otherwise be stored and then
   * be too late to reject. Bounding the ANSWER means the reader can never
   * report, or page to, something it does not have.
   */
  if (pageCount > 0) return Math.min(Math.max(activePage, 1), pageCount);
  return Math.max(activePage, 1);
}
