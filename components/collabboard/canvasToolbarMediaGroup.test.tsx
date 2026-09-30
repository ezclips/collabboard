// PATCH-217. The Media group's three clear buttons.
import { describe, expect, it } from 'vitest';

import { buildCanvasToolbarGroups } from './canvas/ui/canvasToolbarRegistry';

function mediaTools(overrides: Record<string, unknown> = {}) {
  const groups = buildCanvasToolbarGroups({
    isMapLayout: false,
    isFreeformLayout: true,
    isFreeformGraphMode: false,
    isTimelineLayout: false,
    chronoMode: null,
    canManageCanvasShare: false,
    canUseFreeformEditButton: true,
    canCreateBoardContent: true,
    isDrawingLayout: false,
    isDirectPdfLayout: true,
    ...overrides,
  } as never);
  return groups.find((group) => group.id === 'media')?.tools ?? [];
}

describe('PATCH-217 the Media group', () => {
  it('labels its tools, in order, Link, Image, AI/Wiki Documents, Cloud import', () => {
    expect(mediaTools().map((tool) => tool.label)).toEqual([
      'Link', 'Image', 'AI/Wiki Documents', 'Cloud import',
    ]);
  });

  it('has no upload tool', () => {
    expect(mediaTools().some((tool) => tool.type === 'upload')).toBe(false);
  });

  it('keeps the AI/Wiki Documents tool pinned and label-driven', () => {
    const doc = mediaTools().find((tool) => tool.type === 'knowledge-pdf')!;
    expect(doc.label).toBe('AI/Wiki Documents');
    expect(doc.pinned).toBe(true);
    expect(doc.activatesInputId).toBeTruthy();
  });

  it('gives each renamed tool its description', () => {
    const byType = new Map(mediaTools().map((tool) => [tool.type, tool]));
    expect(byType.get('image')?.description).toBe('Free images or upload your own');
    expect(byType.get('knowledge-pdf')?.description).toBe('PDF, Word, Text');
    expect(byType.get('import')?.description).toBe('Google Drive or OneDrive');
  });

  it('omits the documents tool on a layout that cannot place a PDF directly', () => {
    const labels = mediaTools({ isDirectPdfLayout: false }).map((tool) => tool.label);
    expect(labels).toEqual(['Link', 'Image', 'Cloud import']);
  });
});
