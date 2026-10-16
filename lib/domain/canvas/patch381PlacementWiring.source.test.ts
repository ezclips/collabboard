import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PATCH-381. CanvasClient is the 13k-line grandfathered monolith, so the
 * placement wiring is pinned by source rather than rendered. These assertions
 * are the regression net for the four behaviours this patch adds there.
 */
const source = readFileSync(
  join(process.cwd(), 'app/dashboard/canvas/[id]/CanvasClient.tsx'),
  'utf8',
);

describe('PATCH-381 CanvasClient placement wiring', () => {
  it('passes the board-scope container count to the new-post prompts', () => {
    expect(source).toContain('containerCount={boardContainerCount}');
    // twice: the Column prompt and the Wall prompt
    expect(source.match(/containerCount=\{boardContainerCount\}/g)?.length).toBe(2);
  });

  it('asks "Discard this post?" before dropping a placement draft', () => {
    expect(source).toContain('requestDiscardPostConfirm(() => {');
    expect(source).toContain('title="Discard this post?"');
  });

  it('shows the placement prompt in every timeline chrono mode', () => {
    const handler = source.slice(source.indexOf('onTimelinePlacementStart:'), source.indexOf('onTimelinePlacementStart:') + 800);
    expect(handler).toContain("setPlacementPromptMode('timeline-horizontal-all')");
    expect(handler).toContain('setIsPlacementPromptOpen(true)');
  });

  it('suppresses the click that follows a placement mouseup (guards the + buttons)', () => {
    expect(source).toContain("document.addEventListener('click', onClickCapture, true)");
    expect(source).toContain('suppressClickRef.current = placementActiveRef.current');
  });

  it('mounts the first-visit tip only on the four Padlet layouts', () => {
    expect(source).toContain(
      '{(isWallLayout || isColumnsLayout || isGridLayout || isTimelineLayout) && (',
    );
    expect(source).toContain('<FirstTipBar onVisibilityChange={setFirstTipVisible} />');
  });

  it('hides the onboarding bottom hint while the tip bar is shown (no overlap)', () => {
    expect(source).toContain('if (!hintContent || firstTipVisible) return null;');
  });
});
