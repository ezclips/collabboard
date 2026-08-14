import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('PATCH 9A: post -> Column reparenting has exactly one shared implementation', () => {
  it('useCanvasInteractions.ts drag-end handler calls the shared attachPostToContainer helper', () => {
    const src = read('components/collabboard/canvas/hooks/useCanvasInteractions.ts');
    expect(src).toContain("import { attachPostToContainer } from '@/components/collabboard/canvas/hooks/attachPostToContainer'");
    expect(src).toContain('await attachPostToContainer({');
    // No re-inlined childPadletIds/parentId mutation left behind in the hook.
    expect(src).not.toMatch(/childPadletIds:\s*newChildIds/);
  });

  it("CanvasClient.tsx's groupIntoColumn menu handler calls the SAME shared helper for an existing-container target", () => {
    const src = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
    // PATCH 9P: import also brings in cleanupGraphEdgesForContainerChild --
    // still the same attachPostToContainer module, same named export.
    expect(src).toContain("import { attachPostToContainer, cleanupGraphEdgesForContainerChild } from '@/components/collabboard/canvas/hooks/attachPostToContainer'");
    expect(src).toContain('await attachPostToContainer({');
  });

  it('the shared helper module is the single owner of the childPadletIds/parentId write shape', () => {
    const src = read('components/collabboard/canvas/hooks/attachPostToContainer.ts');
    expect(src).toContain('childPadletIds: newChildIds');
    expect(src).toContain('parentId: containerId');
    expect(src).toContain('createUpdatePostMetadataBestEffortCommand');
  });

  it('the destination-eligibility rule (root containers, excluding self) is defined exactly once and reused by both the drag hover-test and the menu submenu list', () => {
    const utilsSrc = read('components/collabboard/canvas/engine/utils.ts');
    expect(utilsSrc.match(/isContainerPadlet\(p\) && p\.id !== excludePadletId && !\(p\.metadata as any\)\?\.parentId/g)?.length).toBe(1);
    expect(utilsSrc).toContain('export function getEligibleContainerDestinations(');

    const interactionsSrc = read('components/collabboard/canvas/hooks/useCanvasInteractions.ts');
    expect(interactionsSrc).toContain('findContainerOverlappingRect(padlets, draggedRect, draggingPadletId)');

    const freeformSrc = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
    expect(freeformSrc).toContain('getEligibleContainerDestinations(padlets, padlet.id)');
  });
});
