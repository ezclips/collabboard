import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PATCH-240. Double-clicking an AI picture on the board opens the Edit window
 * with the clicked word in edit mode. A render test is impractical (FreeformPadletCards
 * is a 6k-line canvas component needing the full freeform context), so this pins
 * the wiring at the source, like the sibling canvas census tests.
 */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const cards = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
const canvas = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
const modals = read('components/collabboard/canvas/ui/CanvasModals.tsx');

describe('PATCH-240 board double-click opens the picture editor at the clicked word', () => {
  it('the card exposes an onAIContentEdit callback carrying the clicked data-ai-edit-ref', () => {
    expect(cards).toContain('onAIContentEdit?: (padlet: Padlet, initialEditRef: string | null) => void;');
    expect(cards).toContain("closest('[data-ai-edit-ref]')");
    expect(cards).toContain('props.onAIContentEdit?.(padlet, initialEditRef)');
  });

  it('a read-only viewer (or a locked post) does nothing on double-click', () => {
    // MUTATION: dropping either guard makes the "viewer does nothing" test fail.
    expect(cards).toContain('if (!canUseFreeformEditButton || (padlet.metadata as any)?.isLocked) return;');
  });

  it('CanvasClient carries the ref through to CanvasModals', () => {
    expect(canvas).toContain('onAIContentEdit={openAIContentEdit}');
    expect(canvas).toContain('initialEditRef={aiContentInitialEditRef}');
  });

  it('CanvasModals passes initialEditRef to AIContentEditModal only', () => {
    expect(modals).toContain('initialEditRef?: string | null;');
    expect(modals).toContain('initialEditRef={initialEditRef ?? null}');
  });
});
