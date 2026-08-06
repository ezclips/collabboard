import React, { type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Padlet } from '@/types/collabboard';
import {
  CAPTION_STYLE_PRESETS,
  normalizeCaptionStyle,
  resolveCaptionStyle,
  type CaptionHeading,
  type CaptionStyle,
} from '@/lib/domain/canvas/captionStyle';
import CardPreview from './CardPreview';

const expectedPresetTable: Record<CaptionHeading, CaptionStyle> = {
  h1: {
    heading: 'h1',
    fontSize: '18px',
    fontWeight: '700',
    fontStyle: 'normal',
    fontFamily: undefined,
    lineHeight: '1.3',
  },
  h2: {
    heading: 'h2',
    fontSize: '16px',
    fontWeight: '600',
    fontStyle: 'normal',
    fontFamily: undefined,
    lineHeight: '1.35',
  },
  normal: {
    heading: 'normal',
    fontSize: '14px',
    fontWeight: '400',
    fontStyle: 'normal',
    fontFamily: undefined,
    lineHeight: '1.4',
  },
  small: {
    heading: 'small',
    fontSize: '12px',
    fontWeight: '400',
    fontStyle: 'normal',
    fontFamily: undefined,
    lineHeight: '1.4',
  },
  code: {
    heading: 'code',
    fontSize: '13px',
    fontWeight: '400',
    fontStyle: 'normal',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    lineHeight: '1.4',
  },
  callout: {
    heading: 'callout',
    fontSize: '14px',
    fontWeight: '500',
    fontStyle: 'normal',
    fontFamily: undefined,
    lineHeight: '1.4',
    backgroundColor: '#fef3c7',
  },
  quote: {
    heading: 'quote',
    fontSize: '14px',
    fontWeight: '400',
    fontStyle: 'italic',
    fontFamily: undefined,
    lineHeight: '1.45',
  },
};

function padlet(overrides: Partial<Padlet> = {}): Padlet {
  const baseMetadata = {
    svgUrl: '/clipart.svg',
    textColor: '#334155',
    backgroundColor: '#ffffff',
    iconBgColor: '#f8f9fa',
    topStripColor: '#4f46e5',
  };

  return {
    id: 'card-1',
    board_id: 'board-1',
    title: 'Clipart caption',
    content: 'one two three',
    type: 'card',
    position_x: 0,
    position_y: 0,
    width: 220,
    height: 220,
    created_at: '2026-07-29T00:00:00.000Z',
    updated_at: '2026-07-29T00:00:00.000Z',
    ...overrides,
    metadata: {
      ...baseMetadata,
      ...overrides.metadata,
    },
  };
}

function renderCard(card: Padlet): string {
  return renderToStaticMarkup(<CardPreview padlet={card} isSelected={false} />);
}

function metadata(value: Record<string, unknown>): Padlet['metadata'] {
  return value as unknown as Padlet['metadata'];
}

function titleDiv(markup: string): string {
  const match = markup.match(/<div class="text-center text-xs font-semibold" style="[^"]*">Clipart caption<\/div>/);
  expect(match).toBeTruthy();
  return match?.[0] ?? '';
}

function style(markup: string): string {
  const match = titleDiv(markup).match(/style="([^"]*)"/);
  return match?.[1] ?? '';
}

describe('CardPreview captionStyle reader legacy compatibility', () => {
  it.each([
    ['absent', undefined],
    ['null', null],
    ['empty object', {}],
    ['malformed string', 'bad'],
    ['malformed values', { color: 'javascript:bad', fontSize: '12px;background:red', fontWeight: '1200' }],
  ])('keeps %s captionStyle byte-identical to legacy markup', (_label, captionStyle) => {
    const legacy = renderCard(padlet({ metadata: { captionStyle: undefined } }));
    const rendered = renderCard(padlet({ metadata: metadata({ captionStyle }) }));

    expect(rendered).toBe(legacy);
    expect(titleDiv(rendered)).toContain('class="text-center text-xs font-semibold"');
    expect(style(rendered)).toBe('color:#334155');
  });

  it('keeps metadata.textColor and default color precedence for legacy cards', () => {
    expect(style(renderCard(padlet({ metadata: { textColor: '#0f172a' } })))).toBe('color:#0f172a');
    expect(style(renderCard(padlet({ metadata: { textColor: undefined } })))).toBe('color:#1F2937');
  });

  it('does not change legacy card dimensions, wrappers, spacing, or title source', () => {
    const legacy = renderCard(padlet());

    expect(legacy).toContain('class="group relative h-full border overflow-hidden transition-colors border-gray-200"');
    expect(legacy).toContain('style="background-color:#ffffff"');
    expect(legacy).toContain('class="pointer-events-none select-none flex h-[calc(100%-22px)] flex-col items-center justify-center gap-2 px-4 py-3"');
    expect(legacy).toContain('class="flex h-32 w-32 items-center justify-center rounded-2xl"');
    expect(legacy).toContain('Clipart caption');
    expect(legacy).not.toContain('Stored metadata caption');
  });
});

describe('CardPreview captionStyle reader rendering', () => {
  it.each([
    ['#RRGGBB', '#dc2626', 'color:#dc2626'],
    ['#RRGGBBAA', '#dc262680', 'color:#dc262680'],
    ['transparent', 'transparent', 'color:transparent'],
  ])('accepts %s captionStyle.color and lets it override metadata.textColor', (_label, colorValue, expected) => {
    const rendered = renderCard(padlet({ metadata: { textColor: '#334155', captionStyle: { color: colorValue } } }));

    expect(style(rendered)).toBe(expected);
  });

  it('falls back from invalid captionStyle.color to metadata.textColor, then default color', () => {
    expect(style(renderCard(padlet({ metadata: { textColor: '#334155', captionStyle: { color: 'red' } } })))).toBe('color:#334155');
    expect(style(renderCard(padlet({ metadata: { textColor: undefined, captionStyle: { color: 'red' } } })))).toBe('color:#1F2937');
  });

  it('renders only valid supplied captionStyle fields without reading caption metadata or writing metadata', () => {
    const source = padlet({
      metadata: metadata({
        caption: 'Stored metadata caption',
        captionText: 'Wrong source',
        captionStyle: {
          heading: 'quote',
          fontSize: '18px',
          fontWeight: '700',
          fontStyle: 'italic',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          lineHeight: '1.45',
          color: '#111827cc',
          backgroundColor: '#fef3c7',
        },
      }),
    });
    const before = JSON.stringify(source);
    const rendered = renderCard(source);

    expect(style(rendered)).toBe(
      'color:#111827cc;font-size:18px;font-weight:700;font-style:italic;font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;line-height:1.45;background-color:#fef3c7',
    );
    expect(rendered).toContain('Clipart caption');
    expect(rendered).not.toContain('Stored metadata caption');
    expect(rendered).not.toContain('Wrong source');
    expect(JSON.stringify(source)).toBe(before);
  });

  it('keeps reaction rendering unchanged while applying captionStyle', () => {
    const rendered = renderToStaticMarkup(
      <CardPreview
        padlet={padlet({ metadata: { svgUrl: undefined, reactions: ['👍', '👍'], captionStyle: { color: '#111827' } } })}
        isSelected={false}
        reactions={['👍', '👍']}
        onAddReaction={() => {}}
        onReactionClick={() => {}}
      />,
    );

    expect(rendered).toContain('class="absolute bottom-2 left-2 flex flex-wrap gap-1 z-10"');
    expect(rendered).toContain('👍');
    expect(rendered).toContain('>2</span>');
    // Document branch title lives in the gray title-bar span, not the
    // Clipart branch's centered div -- extract its style attribute directly.
    const titleSpan = rendered.match(/<span class="text-xs font-semibold text-center truncate" style="([^"]*)">Clipart caption<\/span>/);
    expect(titleSpan?.[1]).toBe('color:#111827');
  });
});

describe('captionStyle preset table and resolver', () => {
  it('matches the authoritative Image-post writer preset table value-for-value', () => {
    expect(CAPTION_STYLE_PRESETS).toEqual(expectedPresetTable);
  });

  it.each(Object.entries(expectedPresetTable) as Array<[CaptionHeading, CaptionStyle]>)(
    'resolves the %s preset to expected rendered CSS',
    (_heading, preset) => {
      const rendered = renderCard(padlet({ metadata: { captionStyle: preset } }));
      const resolved = resolveCaptionStyle(preset, '#334155');

      expect(style(rendered)).toBe(
        Object.entries(resolved)
          .map(([key, value]) => `${key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}:${value}`)
          .join(';'),
      );
    },
  );

  it('normalizes only the authorized captionStyle schema and ignores unknown fields', () => {
    expect(normalizeCaptionStyle({
      heading: 'h1',
      fontSize: '18px',
      fontWeight: '700',
      fontStyle: 'normal',
      fontFamily: 'Inter',
      lineHeight: '1.3',
      color: '#111827',
      backgroundColor: 'transparent',
      opacity: '0.5',
      textOpacity: '0.5',
      captionOpacity: '0.5',
    })).toEqual({
      heading: 'h1',
      fontSize: '18px',
      fontWeight: '700',
      fontStyle: 'normal',
      fontFamily: 'Inter',
      lineHeight: '1.3',
      color: '#111827',
      backgroundColor: 'transparent',
    });
  });
});

describe('CardPreview consumer characterization and static guards', () => {
  it('keeps the three reachable CardPreview consumers and excludes container preview false positives', async () => {
    const [freeform, clipart, containerFull, containerPreview] = await Promise.all([
      import('node:fs/promises').then((fs) => fs.readFile('components/collabboard/canvas/ui/FreeformPadletCards.tsx', 'utf8')),
      import('node:fs/promises').then((fs) => fs.readFile('components/collabboard/editors/ClipartCardDraftModal.tsx', 'utf8')),
      import('node:fs/promises').then((fs) => fs.readFile('components/collabboard/ContainerCardPreviewFull.tsx', 'utf8')),
      import('node:fs/promises').then((fs) => fs.readFile('components/collabboard/ContainerCardPreview.tsx', 'utf8')),
    ]);

    expect((freeform.match(/<CardPreview\b/g) || []).length).toBe(2);
    expect(clipart).toContain('<CardPreview');
    expect(clipart).toContain('padlet={previewPadlet}');
    expect(containerFull).not.toContain('import CardPreview');
    expect(containerFull).not.toMatch(/<CardPreview\b/);
    expect(containerFull).toContain('PostPreviewCard');
    expect(containerPreview).not.toContain('import CardPreview');
    expect(containerPreview).not.toMatch(/<CardPreview\b/);
  });

  it('reads captionStyle in CardPreview without writer, TextStylePopup, Clipart, or reaction changes', async () => {
    const [cardPreview, clipart, toolbar, textStylePopup, reactionDisplay] = await Promise.all([
      import('node:fs/promises').then((fs) => fs.readFile('components/collabboard/CardPreview.tsx', 'utf8')),
      import('node:fs/promises').then((fs) => fs.readFile('components/collabboard/editors/ClipartCardDraftModal.tsx', 'utf8')),
      import('node:fs/promises').then((fs) => fs.readFile('components/collabboard/editors/CardActionsToolbar.tsx', 'utf8')),
      import('node:fs/promises').then((fs) => fs.readFile('components/collabboard/editors/TextStylePopup.tsx', 'utf8')),
      import('node:fs/promises').then((fs) => fs.readFile('components/collabboard/editors/ReactionDisplay.tsx', 'utf8')),
    ]);

    expect(cardPreview).toContain('metadata?.captionStyle');
    expect(cardPreview).not.toMatch(/captionStyle\s*:/);
    expect(cardPreview).not.toContain('TextStylePopup');
    expect(clipart).toContain('InlineCaption');
    expect(toolbar).toContain('TextCursor');
    expect(textStylePopup).toContain('ColorPickerContent');
    expect(reactionDisplay).toContain('reactions.reduce');
  });
});
function findEditCardButton(node: unknown): ReactElement<any> | undefined {
  if (node == null || node === false || node === true) return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findEditCardButton(child);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof node !== 'object') return undefined;
  const element = node as ReactElement<any>;
  if (element.type === 'button' && element.props['aria-label'] === 'Open card') return element;
  return findEditCardButton(element.props?.children);
}
function countButtons(node: unknown): number {
  if (node == null || node === false || node === true) return 0;
  if (Array.isArray(node)) return node.reduce((sum: number, child) => sum + countButtons(child), 0);
  if (typeof node !== 'object') return 0;
  const element = node as ReactElement<any>;
  const own = element.type === 'button' ? 1 : 0;
  return own + countButtons(element.props?.children);
}

// PATCH-152 targeted correction (fix(clipart): remove duplicate edit control):
// FreeformPadletCards.tsx used to wire BOTH onOpenToolbar (a "Card Post Modal"
// ad hoc system) and onEditContent (the CardEditor system) onto the same
// Clipart CardPreview, rendering two Edit-like controls in the top strip.
// The fix keeps a single control (onOpenToolbar, the standard top-strip
// position) and routes it through the same shared ClipartCardDraftModal
// (setIsClipartDraftModalOpen) that Columns/Grid already use via
// executePadletTypeEditor -- CardPreview itself is untouched; only its caller's
// wiring changed.
describe('Clipart post has exactly one Edit control (PATCH-152 targeted correction)', () => {
  it('1: renders exactly one Edit button for the exact prop shape FreeformPadletCards now supplies (onOpenToolbar only)', () => {
    const tree = CardPreview({ padlet: padlet(), isSelected: false, onOpenToolbar: () => {} }) as ReactElement;
    expect(countButtons(tree)).toBe(1);
  });

  it('2: the remaining button opens the Clipart editor', () => {
    const onOpenToolbar = vi.fn();
    const tree = CardPreview({ padlet: padlet(), isSelected: false, onOpenToolbar }) as ReactElement;
    const button = findEditCardButton2(tree)!;
    button.props.onClick({ stopPropagation: () => {} });
    expect(onOpenToolbar).toHaveBeenCalledTimes(1);

    const src = require('node:fs').readFileSync('components/collabboard/canvas/ui/FreeformPadletCards.tsx', 'utf8');
    expect(src).not.toContain('onEditContent=');
    expect(src).toContain('setIsClipartDraftModalOpen(true)');
    // Same trigger the other layouts already use for card+svgUrl (§ executePadletTypeEditor).
    const canvasClientSrc = require('node:fs').readFileSync('app/dashboard/canvas/[id]/CanvasClient.tsx', 'utf8');
    expect(canvasClientSrc).toContain('setIsClipartDraftModalOpen(true)');
  });

  it('3: read-only users (no onOpenToolbar, no onEditContent) see no Edit button', () => {
    const tree = CardPreview({ padlet: padlet(), isSelected: false }) as ReactElement;
    expect(countButtons(tree)).toBe(0);
  });

  it('4: Freeform and the RowLane-based layouts (Wall/Columns/Grid/Table/Timeline/Stream/Map) converge on the same shared trigger', async () => {
    const [freeform, rowLane, canvasClient] = await Promise.all([
      import('node:fs/promises').then((fs) => fs.readFile('components/collabboard/canvas/ui/FreeformPadletCards.tsx', 'utf8')),
      import('node:fs/promises').then((fs) => fs.readFile('components/collabboard/row/RowLane.tsx', 'utf8')),
      import('node:fs/promises').then((fs) => fs.readFile('app/dashboard/canvas/[id]/CanvasClient.tsx', 'utf8')),
    ]);

    // Freeform's single remaining Edit control calls the canonical setter directly.
    expect(freeform).toContain('setIsClipartDraftModalOpen(true)');
    expect(freeform).not.toContain('onEditContent');

    // RowLane (Columns/Grid, and the other row-based layouts that reuse it) exposes
    // a single onEdit affordance via CardShell -- not two -- for every post type.
    expect((rowLane.match(/onEdit=\{isEditable \? \(\(\) => onEditPost\(post\)\) : undefined\}/g) || []).length).toBeGreaterThan(0);

    // Both paths resolve card+svgUrl posts to the same canonical modal in CanvasClient.
    expect(canvasClient).toMatch(/post\.type === 'card' && post\.metadata\?\.svgUrl[\s\S]{0,120}setIsClipartDraftModalOpen\(true\)/);
  });

  it('5: no other post type\'s edit wiring in FreeformPadletCards.tsx changed', async () => {
    const freeform = await import('node:fs/promises').then((fs) => fs.readFile('components/collabboard/canvas/ui/FreeformPadletCards.tsx', 'utf8'));
    // Image posts keep their own, untouched toolbar trigger.
    expect(freeform).toContain('setImageToolbarPadletId');
    // The generic openFreeformPadletModal dispatcher (double-click path for
    // table/link/todo/comment/drawing/container/ai-component/note) is unchanged.
    expect(freeform).toContain("setIsTableEditorOpen(true);");
    expect(freeform).toContain("setIsLinkEditorOpen(true);");
    expect(freeform).toContain("setIsTodoEditorOpen(true);");
    expect(freeform).toContain("setIsCommentEditorOpen(true);");
  });
});

function findEditCardButton2(node: unknown): ReactElement<any> | undefined {
  if (node == null || node === false || node === true) return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findEditCardButton2(child);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof node !== 'object') return undefined;
  const element = node as ReactElement<any>;
  if (element.type === 'button') return element;
  return findEditCardButton2(element.props?.children);
}

describe('CardPreview edit-content affordance (PATCH-138)', () => {
  it.each<[string, Partial<Padlet>]>([
    ['clipart branch', {}],
    ['default branch', { metadata: { svgUrl: undefined } }],
  ])('%s: renders an accessible "Edit card" button and invokes onEditContent exactly once', (_label, overrides) => {
    const onEditContent = vi.fn();
    const tree = CardPreview({ padlet: padlet(overrides), isSelected: false, onEditContent }) as ReactElement;
    const button = findEditCardButton(tree)!;
    expect([button.type, button.props.type]).toEqual(['button', 'button']);
    button.props.onClick({ stopPropagation: () => {} });
    expect(onEditContent).toHaveBeenCalledTimes(1);
  });
  it('renders no Edit card control when onEditContent is absent', () => {
    expect(findEditCardButton(CardPreview({ padlet: padlet(), isSelected: false }))).toBeUndefined();
  });
  it('stops propagation before invoking onEditContent so the parent click handler is not reached', () => {
    const onEditContent = vi.fn();
    const tree = CardPreview({ padlet: padlet(), isSelected: false, onEditContent }) as ReactElement;
    const stopPropagation = vi.fn();
    findEditCardButton(tree)!.props.onClick({ stopPropagation });
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(onEditContent).toHaveBeenCalledTimes(1);
  });
  it('keeps existing title rendering and onOpenToolbar unchanged alongside the new control', () => {
    const rendered = renderToStaticMarkup(
      <CardPreview padlet={padlet()} isSelected={false} onOpenToolbar={() => {}} onEditContent={() => {}} />,
    );
    expect(rendered).toContain('Clipart caption');
    expect(rendered).toContain('aria-label="Open card"');
    expect((rendered.match(/<button/g) || []).length).toBe(2);
  });
});
