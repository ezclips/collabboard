import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A FAILED COMPILE MUST NOT BE PRESENTED AS AN ANSWER ABOUT THE BOARD.
 *
 * On 2026-09-22 the owner added a chess PDF, made a wiki page called "Chess
 * Lessons", and was told: "This board has nothing on that topic yet." The board
 * had plenty on that topic. The PDF was `ready` with 1 page and 2 chunks, and
 * the exact tsquery the app builds -- `chess | lessons` -- returned three
 * chunks including that document.
 *
 * Every compile request was returning 503. The compile reads
 * `transcript_mutation_revision`, whose migration had not been applied yet, so
 * the read threw. The client turned EVERY non-409 status into `null`, and the
 * drawer renders `null` as "nothing on that topic yet".
 *
 * The sentence would have been identical if the database were unreachable. That
 * is the defect this file pins: not the missing column, which is long since
 * applied, but the mapping that let a failure wear the clothes of an answer.
 *
 * Source-level because the handler lives inside an 11k-line client component
 * with no test harness, and the mapping is three lines that must not drift.
 */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const canvasClientSrc = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
const drawerSrc = read('components/collabboard/BoardWikiDrawer.tsx');
const routeSrc = read('lib/server/wiki/boardWikiPageRoute.ts');

/** The recompile handler, isolated so a match elsewhere in the file cannot satisfy these. */
const recompileHandler = (() => {
  const start = canvasClientSrc.indexOf('const requestWikiRecompile = useCallback(');
  expect(start).toBeGreaterThan(-1);
  const end = canvasClientSrc.indexOf('}, [canvasId]);', start);
  expect(end).toBeGreaterThan(start);
  return canvasClientSrc.slice(start, end);
})();

describe('wiki compile failure wiring', () => {
  it('returns null ONLY for 404 -- the one status that means "asked, nothing matched"', () => {
    expect(recompileHandler).toContain('if (response.status === 404) return null;');
  });

  it('throws on every other non-ok status rather than returning null', () => {
    expect(recompileHandler).toContain('throw new Error(`wiki compile failed: ${response.status}`)');
    // The regression shape: a bare `return null` as the catch-all for !response.ok.
    // 404 is the only permitted early return, so exactly one `return null` may
    // appear in the failure branch.
    const failureBranch = recompileHandler.slice(recompileHandler.indexOf('if (!response.ok)'));
    const bareReturns = failureBranch.match(/return null;/g) ?? [];
    expect(bareReturns).toHaveLength(1);
  });

  it('still treats 409 as retryable, which is a different answer again', () => {
    expect(recompileHandler).toContain("if (response.status === 409) throw new Error('retry');");
  });

  it('the drawer renders null as an answer about the board, which is why only 404 may produce it', () => {
    expect(drawerSrc).toContain('This board has nothing on that topic yet.');
    expect(drawerSrc).toContain("compiled === null ?");
  });

  it('the drawer has a DIFFERENT message for a thrown failure, so the two are never conflated', () => {
    expect(drawerSrc).toContain('That compilation came back unusable. Try again.');
  });

  it('the route still maps not_found to 404 and unavailable to 503, which this mapping depends on', () => {
    expect(routeSrc).toContain("not_found: { status: 404");
    expect(routeSrc).toContain('unavailable: { status: 503');
  });
});
