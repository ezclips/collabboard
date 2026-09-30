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

