import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PATCH-221 -- a NEW drawing starts with the frame hidden.
 *
 * The seam. `executeToolAction`'s `case 'draw'` arm cannot be mounted in a unit
 * test: it lives inside CanvasClient's multi-thousand-line component, behind
 * the document-switch guard, the editor state and the authority layer, and the
 * repo has no CanvasClient render harness (see documentSwitchGuard.source.test
 * §36.3: "the harness cannot mount CanvasClient"). The established pattern for
 * this exact block is source characterization -- boardEditAuthorityWiring.source
 * .test slices the SAME `executeToolAction` body between its definition and
 * `handleToolClick`. These assertions bind the one-line draft metadata to the
 * surface that builds it, and name every entry point that reaches it.
 */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const canvasClient = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
const boardMenu = read('components/collabboard/canvas/ui/FreeformCanvasBoardMenu.tsx');
const usePadletSaveSrc = read('hooks/canvas/usePadletSave.ts');

/** The `case 'draw'` arm of `executeToolAction`, up to the next case. */
function drawCase(): string {
  const start = canvasClient.indexOf("case 'draw':");
  expect(start, "case 'draw' not found").toBeGreaterThan(-1);
  const end = canvasClient.indexOf("case 'ai-component':", start);
  expect(end, "case 'ai-component' not found after case 'draw'").toBeGreaterThan(start);
  return canvasClient.slice(start, end);
}

describe("PATCH-221: a new drawing's draft metadata hides the frame", () => {
  it("the 'draw' tool's new-drawing draft carries fullView: true", () => {
    const block = drawCase();
    expect(block).toContain("type: 'drawing',");
    // The one line this patch adds (fullView is cast because Padlet['metadata']
    // does not declare the renderer-read flag).
    expect(block).toContain('{ ...createMetadata, fullView: true }');
    // MUTATION: dropping fullView: true leaves the plain spread behind, and
    // this fails -- the assertion is not vacuous.
    expect(block).not.toContain('metadata: { ...createMetadata },');
    expect(block).toMatch(/fullView: true \} as unknown as Padlet\['metadata'\]/);
  });

  it('the board right-click "New Draw" routes to the same draw tool', () => {
    expect(boardMenu).toContain("{ label: 'New Draw', type: 'draw' }");
    // The board menu emits its type through onToolAction; CanvasClient wires
    // that straight to handleToolClick -> executeToolAction.
    expect(canvasClient).toContain('onToolAction={(toolType) => {');
    expect(canvasClient).toContain('handleToolClick(toolType);');
    expect(canvasClient).toContain('if (!resolveDocumentSwitch({ kind: \'open-tool\', toolType })) executeToolAction(toolType);');
  });

  it('the placement-prompt path preserves the draft metadata through to the insert', () => {
    const start = canvasClient.indexOf('const draftToInsertPayload = (draft: PendingPostDraft, parentId?: string) => {');
    expect(start).toBeGreaterThan(-1);
    const block = canvasClient.slice(start, canvasClient.indexOf("case 'card':", start));
    expect(block).toContain("case 'drawing':");
    // Whatever the 'draw' arm set on draft.metadata (fullView: true) is spread
    // into the placement payload.
    expect(block).toMatch(/case 'drawing':[\s\S]*?\.\.\.draft\.metadata/);
  });

  it('saveDrawing spreads the draft metadata into the insert row', () => {
    const start = usePadletSaveSrc.indexOf('const saveDrawing = useCallback');
    expect(start).toBeGreaterThan(-1);
    const block = usePadletSaveSrc.slice(start, usePadletSaveSrc.indexOf('const nextTitle', start));
    expect(block).toContain('...padletToEdit.metadata,');
  });
});
