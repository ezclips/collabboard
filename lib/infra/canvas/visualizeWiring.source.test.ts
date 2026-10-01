import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PATCH-235. "Visualize…": the menu entry, the plain-text source, the placement
 * and the graph link. Source-level pins, as this repo's canvas census tests do.
 */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const cards = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
const canvas = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
const modals = read('components/collabboard/canvas/ui/CanvasModals.tsx');

describe('PATCH-235 Visualize wiring', () => {
  it('the Note/Document menu gets onVisualize only for the two types, editable, with enough text', () => {
    expect(cards).toContain('onVisualizePost?: (padlet: Padlet) => void;');
    expect(cards).toContain('onVisualize={');
    expect(cards).toContain("(padlet.type === 'text' || isDocumentPost(padlet))");
    expect(cards).toContain('visualizeSourceText(padlet).trim().length >= 20');
    expect(cards).toContain('props.onVisualizePost?.(padlet)');
  });

  it('CanvasClient opens the generator pre-filled and placed to the right', () => {
    expect(canvas).toContain('const handleVisualizePost = useCallback((padlet: Padlet) => {');
    expect(canvas).toContain('prompt: visualizeSourceText(padlet)');
    // Addendum 2: measured source size + a free-spot search, not a fixed offset.
    expect(canvas).toContain('wrapper?.offsetWidth || Number(padlet.width) || 320');
    expect(canvas).toContain('wrapper?.offsetHeight || Number(padlet.height) || 200');
    expect(canvas).toContain('findVisualizeSpot({');
    expect(canvas).toContain('setIsAIComponentEditorOpen(true);');
    expect(canvas).toContain('onVisualizePost={handleVisualizePost}');
    expect(canvas).toContain('initialVisualize={!!visualizeRequest}');
    expect(canvas).toContain('visualizePrompt={visualizeRequest?.prompt}');
    expect(canvas).toContain('saveAIComponent={handleSaveAIComponent}');
    // The prompt travels in the request, not on the draft: the
    // knowledgeSourceAiWiring census bans an ai* literal in this file.
    expect(canvas).not.toContain('aiPrompt');
    // Cleared on save, cancel and close.
    expect(canvas).toContain('if (!isAIComponentEditorOpen) setVisualizeRequest(null);');
  });

  it('the edge after save is gated on isFreeformGraphMode', () => {
    expect(canvas).toContain('createFreeformGraphRepo(String(canvasId))');
    expect(canvas).toContain('if (!isFreeformGraphMode) return;');
    expect(canvas).toContain('source_post_id: pending.sourceId');
    expect(canvas).toContain('The picture was added, but the link line could not be drawn.');
  });

  it('CanvasModals passes initialVisualize and the visualize prompt to AIComponentEditor', () => {
    expect(modals).toContain('initialVisualize={initialVisualize}');
    expect(modals).toContain('visualizePrompt?: string;');
    expect(modals).toContain("initialPrompt={visualizePrompt || padletToEdit?.metadata?.aiPrompt || ''}");
  });
});
