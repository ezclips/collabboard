import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PATCH-223 -- the Freeform board's three wiring points for a drawing's click
 * and its "View full size" menu item.
 *
 * A render test is impractical: FreeformPadletCards is a 6k-line canvas
 * component that needs the full freeform context (camera, selection store,
 * drag/drop, Supabase-backed handlers). The repo's established seam for
 * source-level wiring like this is characterization (see the sibling
 * boardEditAuthorityWiring.source.test.ts, documentSwitchGuard.source.test.ts),
 * so these three assertions bind the wiring instead of mounting the board.
 */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const cards = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
const canvasClient = read('app/dashboard/canvas/[id]/CanvasClient.tsx');

describe('PATCH-223 the board wires the drawing click and menu correctly', () => {
  it('the Drawing Card Display wires onView only for a viewer; an editor uses the menu', () => {
    const start = cards.indexOf('{/* Drawing Card Display */}');
    expect(start, 'Drawing Card Display block not found').toBeGreaterThan(-1);
    const end = cards.indexOf('{/* Image as Link Display */}', start);
    expect(end, 'Image as Link Display block not found after Drawing').toBeGreaterThan(start);
    const block = cards.slice(start, end);
    expect(block).toContain('<PostCardContent');
    // Addendum 2: viewer (no edit rights) keeps click-to-view; editor's click
    // selects and "View full size" lives in the right-click menu.
    expect(block).toContain(
      'onView={canUseFreeformEditButton ? undefined : () => setViewDrawingPadlet(padlet)}',
    );
  });

  it("the shared fallback wrapper stops a drawing's click so its selection ring sticks", () => {
    expect(cards).toContain(
      "onClick={(padlet.type === 'text' || padlet.type === 'ai-component' || padlet.type === 'file' || padlet.type === 'drawing') ? (e) => e.stopPropagation() : undefined}",
    );
  });

  it("the drawing's NotePostContextMenu receives onViewFullSize", () => {
    expect(cards).toContain(
      "onViewFullSize={padlet.type === 'drawing' ? () => setViewDrawingPadlet(padlet) : undefined}",
    );
  });
});

describe('PATCH-225 the Reactions Row drops its divider when the post frame is hidden', () => {
  it('the non-overlay branch is border-free for isFullView and keeps border-t otherwise', () => {
    // The nested ternary: the framed arm keeps the divider verbatim...
    expect(cards).toContain(
      ': isFullView ? "flex items-center gap-1.5 pt-1.5 mt-1.5" : "flex items-center gap-1.5 pt-1.5 mt-1.5 border-t border-gray-100"}',
    );
    // ...and the border-free fullView arm exists (the mutation removes it).
    expect(cards).toContain('isFullView ? "flex items-center gap-1.5 pt-1.5 mt-1.5"');
  });
});

describe('PATCH-227 the connect dot is wired on the board', () => {
  const dotStart = cards.indexOf('{/* PATCH-227: drag the dot');
  const dotEnd = cards.indexOf('{/* Comment Badge', dotStart);
  const dotBlock = dotStart > -1 && dotEnd > dotStart ? cards.slice(dotStart, dotEnd) : '';

  it('renders the handle only for exactly one selected, top-level, unlocked post in edit mode', () => {
    expect(dotStart, 'connect-dot block not found').toBeGreaterThan(-1);
    for (const condition of [
      'isFreeformGraphMode &&',
      'canUseFreeformEditButton &&',
      '!isLineMode &&',
      '!isGraphConnectMode &&',
      '!anyPostDragInProgress &&',
      '!(padlet.metadata as any)?.parentId &&',
      '!(padlet.metadata as any)?.isLocked &&',
      'singleSelectedId === padlet.id &&',
    ]) {
      expect(dotBlock, `missing show-condition: ${condition}`).toContain(condition);
    }
    expect(dotBlock).toContain('<GraphConnectHandle');
    expect(dotBlock).toContain('onEdgesChanged={props.onGraphEdgesChanged}');
  });

  it('the post wrapper ignores a mousedown that starts on the handle', () => {
    // MUTATION: dropping this guard makes the test fail.
    expect(cards).toContain(`closest('[data-graph-connect-handle="true"]')`);
  });

  it('the generic Reactions Row carries the exclude marker', () => {
    const marker = cards.indexOf('data-graph-anchor-exclude="true"');
    expect(marker).toBeGreaterThan(-1);
    // The marker sits on the same element as the census-pinned Reactions Row ternary.
    const rowBlock = cards.slice(marker, marker + 400);
    expect(rowBlock).toContain("padlet.type === 'ai-component' && (padlet.metadata?.reactions?.length ?? 0) === 0");
  });

  it('CanvasClient refreshes the graph layer when the dot writes an edge', () => {
    expect(canvasClient).toContain(
      'onGraphEdgesChanged={() => setGraphRefreshToken((token) => token + 1)}',
    );
  });
});


