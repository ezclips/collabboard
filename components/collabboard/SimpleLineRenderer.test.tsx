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

type RendererProps = React.ComponentProps<typeof SimpleLineRenderer>;

const baseProps: Omit<RendererProps, 'lines'> = {
  selectedLineId: null,
  onSelectLine: () => {},
  onUpdateLine: () => {},
  onSaveLine: () => {},
  onCreateLine: () => {},
  isLineMode: false,
  isEditMode: false,
  onToggleEditMode: () => {},
  drawingViewport: viewport,
};

function renderWithProps(props: Partial<RendererProps> & { lines: CanvasLine[] }) {
  return renderToStaticMarkup(
    <SimpleLineRenderer
      {...baseProps}
      {...props}
    />,
  );
}

function render(lines: CanvasLine[], drawingViewport = viewport) {
  return renderWithProps({ lines, drawingViewport });
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

describe('SimpleLineRenderer visible canvas containment', () => {
  it.each([
    ['front idle', { layer: 'front' as const }],
    ['front selected', { layer: 'front' as const, selectedLineId: 'same' }],
    ['front line mode', { layer: 'front' as const, isLineMode: true }],
    ['front edit mode', { layer: 'front' as const, selectedLineId: 'same', isEditMode: true }],
    ['back idle', { layer: 'back' as const }],
    ['back selected', { layer: 'back' as const, selectedLineId: 'same' }],
  ])('keeps no-boundary %s output free of containment markup', (_label, props) => {
    const markup = renderWithProps({ lines: [line('same', { coord_space: null })], ...props });

    expect(markup).not.toContain('data-line-containment');
    expect(markup).not.toContain('clip-path');
    expect(markup).toContain('class="absolute inset-0 overflow-visible"');
  });

  it.each([
    ['selected', { selectedLineId: 'bounded' }],
    ['line mode', { isLineMode: true }],
    ['edit mode', { selectedLineId: 'bounded', isEditMode: true }],
  ])('clips front-layer visual and hit output when a boundary is supplied in %s state', (_label, props) => {
    const markup = renderWithProps({
      lines: [line('bounded', { coord_space: null, end_x: 900, end_y: 60, label: 'Bounded label' })],
      layer: 'front',
      visibleCanvasRightInsetPx: 320,
      ...props,
    });

    expect(markup).toContain('data-line-containment="visible-canvas"');
    expect(markup).toContain('clip-path:inset(0 320px 0 0)');
    expect(markup).toContain('data-line-role="hit-path"');
    expect(markup).toContain('data-line-role="visible-path"');
    expect(markup).toContain('Bounded label');
    expect(markup).toContain('z-index:1000');
  });

  it('leaves rendered geometry unchanged inside the visible canvas when clipping is supplied', () => {
    const unbounded = renderWithProps({ lines: [line('same', { coord_space: null })] });
    const bounded = renderWithProps({
      lines: [line('same', { coord_space: null })],
      visibleCanvasRightInsetPx: 320,
    });

    expect(unbounded).toContain('d="M 10 20 Q 30 40 50 60"');
    expect(bounded).toContain('d="M 10 20 Q 30 40 50 60"');
  });

  it('keeps back-layer stacking unchanged while allowing boundary containment', () => {
    const unbounded = renderWithProps({ lines: [line('back', { coord_space: null })], layer: 'back' });
    const bounded = renderWithProps({
      lines: [line('back', { coord_space: null })],
      layer: 'back',
      visibleCanvasRightInsetPx: 320,
    });

    expect(unbounded).toContain('z-index:0');
    expect(bounded).toContain('z-index:0');
    expect(bounded).toContain('clip-path:inset(0 320px 0 0)');
  });

  it('keeps selected edit handles interactive inside the boundary', () => {
    const markup = renderWithProps({
      lines: [line('editable', { coord_space: null })],
      selectedLineId: 'editable',
      isEditMode: true,
      visibleCanvasRightInsetPx: 320,
    });

    expect(markup).toContain('data-line-role="start-handle"');
    expect(markup).toContain('data-line-role="control-handle"');
    expect(markup).toContain('data-line-role="end-handle"');
    expect(markup).toContain('pointer-events:auto');
  });

  it('does not mutate stored line geometry while rendering containment', () => {
    const source = line('immutable', { coord_space: null, end_x: 900, label: 'Immutable' });
    const before = JSON.stringify(source);

    renderWithProps({ lines: [source], visibleCanvasRightInsetPx: 320 });

    expect(JSON.stringify(source)).toBe(before);
  });
});
