import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CanvasLine } from '@/types/collabboard';
import SimpleLineRenderer from './SimpleLineRenderer';

const viewport = { zoom: 2, scrollX: -30, scrollY: 10, originOffsetX: 7, originOffsetY: -4 };

function line(id: string, overrides: Partial<CanvasLine> = {}): CanvasLine {
  return {
    id,
    board_id: 'board',
    start_x: 10,
    start_y: 20,
    control_x: 30,
    control_y: 40,
    end_x: 50,
    end_y: 60,
    color: '#000',
    stroke_width: 2,
    layer_plane: 'front',
    start_arrow: false,
    end_arrow: true,
    dashed: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function render(lines: CanvasLine[], drawingViewport = viewport) {
  return renderToStaticMarkup(
    <SimpleLineRenderer
      lines={lines}
      selectedLineId={null}
      onSelectLine={() => {}}
      onUpdateLine={() => {}}
      onSaveLine={() => {}}
      onCreateLine={() => {}}
      isLineMode={false}
      isEditMode={false}
      onToggleEditMode={() => {}}
      drawingViewport={drawingViewport}
    />,
  );
}

describe('SimpleLineRenderer Drawing coordinate gating', () => {
  it.each([
    ['null', { coord_space: null }],
    ['undefined', {}],
  ])('keeps a %s-coordinate-space row in the untransformed legacy group with identical geometry', (_label, override) => {
    const markup = render([
      line('legacy', override),
      line('scene-sibling', { coord_space: 'scene', start_x: 70, start_y: 80, control_x: 90, control_y: 100, end_x: 110, end_y: 120 }),
    ]);
    const legacyVisibleGroupStart = '<g data-line-coordinate-space="legacy" data-line-render-pass="visible"><g><path d="M 10 20 Q 30 40 50 60"';
    const sceneVisibleGroupStart = '<g data-line-coordinate-space="scene" data-line-render-pass="visible" transform="translate(-53, 16) scale(2)"><g><path d="M 70 80 Q 90 100 110 120"';

    expect(markup).toContain(legacyVisibleGroupStart);
    expect(markup).toContain(sceneVisibleGroupStart);
    expect(markup).toContain('scale(2)');
  });

  it('places scene rows in the transformed group and keeps hit paths non-scaling', () => {
    const markup = render([line('scene', { coord_space: 'scene' })]);
    expect(markup).toContain('translate(-53, 16) scale(2)');
    expect(markup).toContain('vector-effect="non-scaling-stroke"');
  });

  it('preserves front and back planes through the same Drawing group rules', () => {
    const front = render([line('front', { coord_space: 'scene', layer_plane: 'front' })]);
    const back = render([line('back', { coord_space: 'scene', layer_plane: 'back' })]);
    expect(front).toContain('data-line-id="front"');
    expect(back).toContain('data-line-id="back"');
    expect(front).toContain('translate(-53, 16) scale(2)');
    expect(back).toContain('translate(-53, 16) scale(2)');
  });

  it('takes the legacy-only path when Drawing viewport data is absent', () => {
    const markup = renderToStaticMarkup(
      <SimpleLineRenderer
        lines={[line('freeform', { coord_space: null })]}
        selectedLineId={null}
        onSelectLine={() => {}}
        onUpdateLine={() => {}}
        onSaveLine={() => {}}
        onCreateLine={() => {}}
        isLineMode={false}
        isEditMode={false}
        onToggleEditMode={() => {}}
      />,
    );
    expect(markup).toContain('d="M 10 20 Q 30 40 50 60"');
    expect(markup).not.toContain('scale(2)');
  });

  it('marks Drawing line layers before viewport data exists so DrawingLayout can measure the real layer origin', () => {
    const markup = renderToStaticMarkup(
      <SimpleLineRenderer
        lines={[]}
        selectedLineId={null}
        onSelectLine={() => {}}
        onUpdateLine={() => {}}
        onSaveLine={() => {}}
        onCreateLine={() => {}}
        isLineMode={false}
        isEditMode={false}
        onToggleEditMode={() => {}}
        excalidrawAPIRef={{ current: {} }}
      />,
    );

    expect(markup).toContain('data-drawing-line-layer="front"');
  });

  it('does not mark non-Drawing line layers as Drawing measurement targets', () => {
    const markup = renderToStaticMarkup(
      <SimpleLineRenderer
        lines={[]}
        selectedLineId={null}
        onSelectLine={() => {}}
        onUpdateLine={() => {}}
        onSaveLine={() => {}}
        onCreateLine={() => {}}
        isLineMode={false}
        isEditMode={false}
        onToggleEditMode={() => {}}
      />,
    );

    expect(markup).not.toContain('data-drawing-line-layer');
  });
});
