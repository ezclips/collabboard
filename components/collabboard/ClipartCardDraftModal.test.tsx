import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Padlet } from '@/types/collabboard';
import ClipartCardDraftModal from './editors/ClipartCardDraftModal';
import CardActionsToolbar from './editors/CardActionsToolbar';
import { CAPTION_STYLE_PRESETS } from '@/lib/domain/canvas/captionStyle';

const state = vi.hoisted(() => ({
  values: [] as unknown[],
  calls: [] as Array<{ index: number; value: unknown }>,
  nextIndex: 0,
}));

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    default: actual,
    useMemo: <T,>(factory: () => T) => factory(),
    useState: <T,>(initial: T) => {
      const index = state.nextIndex++;
      const value = index < state.values.length ? state.values[index] as T : initial;
      return [
        value,
        (next: T | ((previous: T) => T)) => {
          const resolved = typeof next === 'function' ? (next as (previous: T) => T)(value) : next;
          state.calls.push({ index, value: resolved });
        },
      ] as const;
    },
  };
});

type ReactNode = React.ReactElement & { props: Record<string, unknown> };

function resetState(values: unknown[] = []) {
  state.values = values;
  state.calls = [];
  state.nextIndex = 0;
}

function fixturePadlet(metadata: Record<string, unknown> = {}, title = 'Library clipart'): Padlet {
  return {
    id: 'new',
    board_id: 'board-1',
    title,
    content: '',
    type: 'card',
    position_x: 0,
    position_y: 0,
    width: 180,
    height: 220,
    metadata: {
      svgUrl: '/clipart.svg',
      iconBgColor: '#ec4899',
      counterType: 'words',
      ...metadata,
    },
    created_at: '2026-07-29T00:00:00.000Z',
    updated_at: '2026-07-29T00:00:00.000Z',
  } as Padlet;
}

function renderModal(options: {
  metadata?: Record<string, unknown>;
  title?: string;
  stateValues?: unknown[];
  onChange?: (padlet: Padlet) => void;
  onClose?: () => void;
  onReplaceIcon?: () => void;
} = {}) {
  resetState();
  const staticElement = (
    <ClipartCardDraftModal
      isOpen={true}
      padlet={fixturePadlet(options.metadata, options.title)}
      onClose={options.onClose || vi.fn()}
      onDiscard={vi.fn()}
      onChange={options.onChange || vi.fn()}
      onReplaceIcon={options.onReplaceIcon || vi.fn()}
    />
  );
  const markup = renderToStaticMarkup(staticElement);
  resetState(options.stateValues);
  const element = ClipartCardDraftModal({
    isOpen: true,
    padlet: fixturePadlet(options.metadata, options.title),
    onClose: options.onClose || vi.fn(),
    onDiscard: vi.fn(),
    onChange: options.onChange || vi.fn(),
    onReplaceIcon: options.onReplaceIcon || vi.fn(),
  }) as ReactNode;
  return { element, markup };
}

function renderToolbar(props: Partial<React.ComponentProps<typeof CardActionsToolbar>> = {}) {
  const baseProps: React.ComponentProps<typeof CardActionsToolbar> = {
    padlet: fixturePadlet(),
    onColorClick: vi.fn(),
    onReplaceIcon: vi.fn(),
    onToggleCardView: vi.fn(),
    onAddReaction: vi.fn(),
    onComment: vi.fn(),
    ...props,
  };
  return renderToStaticMarkup(<CardActionsToolbar {...baseProps} />);
}

function childrenOf(node: unknown): unknown[] {
  if (!node || typeof node !== 'object') return [];
  const props = (node as ReactNode).props;
  const children = props?.children;
  return Array.isArray(children) ? children : children ? [children] : [];
}

function findElement(node: unknown, predicate: (node: ReactNode) => boolean): ReactNode | null {
  if (!node || typeof node !== 'object') return null;
  const element = node as ReactNode;
  if (element.props && predicate(element)) return element;
  for (const child of childrenOf(element)) {
    const found = findElement(child, predicate);
    if (found) return found;
  }
  return null;
}

function findByComponentName(node: unknown, name: string): ReactNode {
  const found = findElement(node, (element) => {
    const type = element.type as { name?: string };
    return type?.name === name;
  });
  expect(found, `${name} should render`).toBeTruthy();
  return found!;
}

function sourceFor(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function toolbarProps(element: ReactNode) {
  return findByComponentName(element, 'CardActionsToolbar').props as {
    commentCount?: number;
    commentBadgeColor?: string;
    onColorClick: (event: { stopPropagation: () => void }, type: 'topstrip' | 'icon' | 'background') => void;
    onReplaceIcon: () => void;
    onToggleCardView: () => void;
    onAddReaction: (event: { stopPropagation: () => void }) => void;
    onComment: () => void;
    onCaption?: () => void;
    isCaptionActive?: boolean;
  };
}

function testIdNode(element: ReactNode, testId: string): ReactNode | null {
  return findElement(element, (candidate) => candidate.props?.['data-testid'] === testId);
}

function mainPanelNode(element: ReactNode): ReactNode {
  const node = testIdNode(element, 'clipart-main-panel');
  expect(node, 'main Clipart panel should render').toBeTruthy();
  return node!;
}

function previewAnchorNode(element: ReactNode): ReactNode {
  const node = testIdNode(element, 'clipart-card-preview-anchor');
  expect(node, 'clipart card preview anchor should render').toBeTruthy();
  return node!;
}

function previewWrapperNode(element: ReactNode): ReactNode {
  const node = testIdNode(element, 'clipart-card-preview-wrapper');
  expect(node, 'clipart card preview wrapper should render').toBeTruthy();
  return node!;
}

function mainBadgeNode(element: ReactNode): ReactNode | null {
  return testIdNode(element, 'clipart-main-comment-badge');
}

function compositionRowNode(element: ReactNode): ReactNode {
  const node = testIdNode(element, 'clipart-composition-row');
  expect(node, 'composition row should render').toBeTruthy();
  return node!;
}

function inlineCaptionNode(element: ReactNode): ReactNode {
  const node = testIdNode(element, 'clipart-inline-caption');
  expect(node, 'inline caption should render').toBeTruthy();
  return node!;
}

function textStylePopupProps(element: ReactNode) {
  return findByComponentName(element, 'TextStylePopup').props as {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSelectHeading: (level: 'h1' | 'h2' | 'normal' | 'small' | 'code' | 'callout' | 'quote') => void;
    onSelectColor: (color: string) => void;
    onSelectHighlight: (color: string) => void;
    currentHeading?: string;
    currentColor?: string;
    currentHighlight?: string;
  };
}

function emojiPickerNode(element: ReactNode): ReactNode {
  const node = findElement(element, (candidate) =>
    candidate.props?.width === 300 &&
    candidate.props?.height === 400 &&
    candidate.props?.lazyLoadEmojis === true &&
    typeof candidate.props?.onEmojiClick === 'function',
  );
  expect(node, 'emoji-picker-react picker should render').toBeTruthy();
  return node!;
}

function collectText(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return childrenOf(node).map(collectText).join('');
}

function toolbarLabels(markup: string): string[] {
  return [...markup.matchAll(/<span class="text-\[9px\][^"]*">([^<]+)<\/span>/g)].map((match) => match[1]);
}

describe('ClipartCardDraftModal reaction and comment metadata', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('opens reaction and comment panels through toolbar handlers', () => {
    const { element } = renderModal();
    const props = toolbarProps(element);

    props.onAddReaction({ stopPropagation: vi.fn() });
    expect(state.calls).toContainEqual({ index: 2, value: true });
    expect(state.calls).toContainEqual({ index: 3, value: false });

    resetState();
    props.onComment();
    expect(state.calls).toContainEqual({ index: 3, value: true });
    expect(state.calls).toContainEqual({ index: 2, value: false });
  });

  it('selecting an emoji appends duplicate reactions and closes the emoji picker', () => {
    const onChange = vi.fn();
    const { element } = renderModal({
      metadata: { reactions: ['existing', 'new-emoji'], comments: [{ id: 'legacy' }], other: 'preserved' },
      stateValues: [false, false, true, false, false],
      onChange,
    });
    const picker = emojiPickerNode(element);

    (picker.props.onEmojiClick as (emojiData: { emoji: string }) => void)({ emoji: 'added' });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          reactions: ['existing', 'new-emoji', 'added'],
          comments: [{ id: 'legacy' }],
          other: 'preserved',
        }),
      }),
    );
    expect(state.calls).toContainEqual({ index: 2, value: false });

    onChange.mockClear();
    (picker.props.onEmojiClick as (emojiData: { emoji: string }) => void)({ emoji: 'new-emoji' });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          reactions: ['existing', 'new-emoji', 'new-emoji'],
          comments: [{ id: 'legacy' }],
          other: 'preserved',
        }),
      }),
    );
  });

  it('submitting a comment preserves detachedComments and never writes metadata.comments', () => {
    vi.setSystemTime(new Date('2026-07-29T10:00:00.000Z'));
    const onChange = vi.fn();
    const existingComment = {
      id: 'comment-existing',
      text: 'existing',
      userId: 'anon',
      userName: 'You',
      timestamp: 1,
    };
    const { element } = renderModal({
      metadata: {
        comments: [{ id: 'inline-comment', text: 'do not touch' }],
        detachedComments: [existingComment],
        other: 'preserved',
      },
      stateValues: [false, false, false, true, false],
      onChange,
    });
    const popup = findByComponentName(element, 'CommentPopup');

    (popup.props.onSubmit as (text: string) => void)('draft comment');

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          comments: [{ id: 'inline-comment', text: 'do not touch' }],
          detachedComments: [
            existingComment,
            expect.objectContaining({
              id: expect.stringMatching(/^comment-/),
              text: 'draft comment',
              userId: 'anon',
              userName: 'You',
              timestamp: Date.now(),
            }),
          ],
          other: 'preserved',
        }),
      }),
    );
    expect(onChange.mock.calls[0][0].metadata.comments).toEqual([{ id: 'inline-comment', text: 'do not touch' }]);
  });

  it('derives comment count by fallback without summing both comment fields', () => {
    const both = renderModal({
      metadata: {
        detachedComments: [{ id: 'd1' }, { id: 'd2' }],
        comments: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }],
      },
    });
    expect(toolbarProps(both.element).commentCount).toBe(2);

    const legacyOnly = renderModal({
      metadata: {
        comments: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }],
      },
    });
    expect(toolbarProps(legacyOnly.element).commentCount).toBe(3);
  });

  it('renders the main-panel badge only for a positive shared comment count', () => {
    const empty = renderModal();
    expect(toolbarProps(empty.element).commentCount).toBe(0);
    expect(mainBadgeNode(empty.element)).toBeNull();
    expect(empty.markup).not.toContain('data-testid="clipart-main-comment-badge"');

    const withComments = renderModal({
      metadata: {
        detachedComments: [{ id: 'd1' }, { id: 'd2' }],
      },
    });
    const badge = mainBadgeNode(withComments.element);

    expect(toolbarProps(withComments.element).commentCount).toBe(2);
    expect(badge).toBeTruthy();
    expect(childrenOf(badge)).toContain(2);
    expect(badge!.props['aria-label']).toBe('Open comments, 2 comments');
  });

  it('uses the shared badge colour for both toolbar and main-panel badges', () => {
    const fallback = renderModal({ metadata: { detachedComments: [{ id: 'd1' }] } });
    expect(toolbarProps(fallback.element).commentBadgeColor).toBe('#facc15');
    expect((mainBadgeNode(fallback.element)!.props.style as { backgroundColor?: string }).backgroundColor).toBe('#facc15');

    const custom = renderModal({
      metadata: {
        detachedComments: [{ id: 'd1' }],
        badgeColor: '#fb923c',
      },
    });
    expect(toolbarProps(custom.element).commentBadgeColor).toBe('#fb923c');
    expect((mainBadgeNode(custom.element)!.props.style as { backgroundColor?: string }).backgroundColor).toBe('#fb923c');
  });

  it('renders a compact square-cornered editor instead of the former rounded shell', () => {
    const { element } = renderModal();
    const source = sourceFor('components/collabboard/editors/ClipartCardDraftModal.tsx');
    const mainPanel = mainPanelNode(element);
    const anchor = previewAnchorNode(element);
    const wrapper = previewWrapperNode(element);
    const inlineCaption = inlineCaptionNode(element);

    expect(String(mainPanel.props.className)).toContain('w-[220px]');
    expect(String(mainPanel.props.className)).not.toContain('w-[320px]');
    expect(String(mainPanel.props.className)).not.toContain('rounded-[28px]');
    expect(String(mainPanel.props.className)).not.toContain('bg-white');
    expect(String(mainPanel.props.className)).not.toContain('p-5');

    expect(String(anchor.props.className)).toContain('relative');
    expect(String(anchor.props.className)).toContain('w-[220px]');
    expect(String(anchor.props.className)).toContain('overflow-visible');
    expect(String(wrapper.props.className)).toContain('overflow-hidden');
    expect(String(wrapper.props.className)).toContain('border border-gray-200');
    expect(String(wrapper.props.className)).toContain('shadow-2xl');
    expect((wrapper.props.style as { width?: string; minHeight?: string }).width).toBe('220px');
    expect((wrapper.props.style as { width?: string; minHeight?: string }).minHeight).toBe('200px');

    expect(findElement(wrapper, (node) => node.props?.['data-testid'] === 'clipart-inline-caption')).toBeTruthy();
    expect(findElement(mainPanel, (node) => node.props?.['data-testid'] === 'clipart-caption-editor')).toBeNull();
    expect(findElement(mainPanel, (node) => node.props?.placeholder === 'Optional caption')).toBeNull();
    expect(collectText(inlineCaption)).not.toContain('CAPTION');
    expect(collectText(inlineCaption)).not.toContain('Caption');

    for (const oldShellClass of ['min-h-[520px]', 'rounded-[28px]', 'w-[320px]', 'p-5']) {
      expect(source).not.toContain(oldShellClass);
    }
    expect(source).not.toContain('placeholder="Optional caption"');
    expect(source).not.toContain('uppercase tracking-[0.14em]');
  });

  it('adds Caption to CardActionsToolbar only when supplied, immediately after Icon', () => {
    const defaultMarkup = renderToolbar();
    const omittedMarkup = renderToolbar({ onCaption: undefined, isCaptionActive: undefined });
    expect(defaultMarkup).toBe(omittedMarkup);
    expect(defaultMarkup).not.toContain('title="Caption"');

    const withCaption = renderToolbar({ onCaption: vi.fn() });
    expect(withCaption).toContain('title="Caption"');
    expect(withCaption).toContain('lucide-text-cursor');
    expect(toolbarLabels(withCaption)).toEqual(['Color', 'Icon', 'Caption', 'Card view', 'Reaction', 'Comment']);
  });

  it('invokes Caption from the toolbar and reflects active state', () => {
    const onCaption = vi.fn();
    const inactive = renderToolbar({ onCaption, isCaptionActive: false });
    const active = renderToolbar({ onCaption, isCaptionActive: true });
    expect(inactive).toContain('title="Caption"');
    expect(inactive).not.toMatch(/bg-blue-100 text-blue-600" title="Caption"/);
    expect(active).toMatch(/bg-blue-100 text-blue-600" title="Caption"/);

    const { element } = renderModal();
    const toolbar = findByComponentName(element, 'CardActionsToolbar');
    (toolbar.props.onCaption as () => void)();
    expect(state.calls).toContainEqual({ index: 5, value: true });
  });

  it('keeps toolbar panel-switch clicks from being consumed by InlineCaption blur', () => {
    const { element: captionOpen } = renderModal({ stateValues: [false, false, false, false, false, true] });
    const toolbarWrapper = testIdNode(captionOpen, 'clipart-toolbar-wrapper');
    const preventDefault = vi.fn();
    expect(typeof toolbarWrapper!.props.onMouseDownCapture).toBe('function');

    (toolbarWrapper!.props.onMouseDownCapture as (event: { target: HTMLElement; preventDefault: () => void }) => void)({
      target: { closest: (selector: string) => selector === 'button' ? {} : null } as HTMLElement,
      preventDefault,
    });
    expect(preventDefault).toHaveBeenCalledTimes(1);

    const { element: captionClosed } = renderModal({ stateValues: [false, false, false, false, false, false] });
    const closedToolbarWrapper = testIdNode(captionClosed, 'clipart-toolbar-wrapper');
    const closedPreventDefault = vi.fn();
    (closedToolbarWrapper!.props.onMouseDownCapture as (event: { target: HTMLElement; preventDefault: () => void }) => void)({
      target: { closest: () => ({}) } as unknown as HTMLElement,
      preventDefault: closedPreventDefault,
    });
    expect(closedPreventDefault).not.toHaveBeenCalled();
  });

  it('opens Caption TextStylePopup on the right without writing metadata', () => {
    const onChange = vi.fn();
    const { element } = renderModal({
      metadata: { captionStyle: { color: '#dc2626', backgroundColor: '#fef3c7', heading: 'quote' } },
      stateValues: [false, false, false, false, false, true],
      onChange,
    });
    const panel = testIdNode(element, 'clipart-caption-style-panel');
    const popup = textStylePopupProps(element);

    expect(panel).toBeTruthy();
    expect(String(panel!.props.className)).toContain('bg-white rounded-lg shadow-xl border border-gray-200 p-3 min-w-[240px]');
    expect(popup.isOpen).toBe(true);
    expect(popup.currentHeading).toBe('quote');
    expect(popup.currentColor).toBe('#dc2626');
    expect(popup.currentHighlight).toBe('#fef3c7');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('writes caption presets by merging over the existing base style', () => {
    const onChange = vi.fn();
    const { element } = renderModal({
      metadata: {
        captionStyle: {
          color: '#2563eb',
          backgroundColor: '#ccfbf1',
          fontFamily: 'Inter',
          lineHeight: '1.9',
        },
        other: 'preserved',
      },
      stateValues: [false, false, false, false, false, true],
      onChange,
    });
    const popup = textStylePopupProps(element);

    popup.onSelectHeading('h1');
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          other: 'preserved',
          captionStyle: {
            color: '#2563eb',
            backgroundColor: '#ccfbf1',
            fontFamily: undefined,
            heading: 'h1',
            fontSize: '18px',
            fontWeight: '700',
            fontStyle: 'normal',
            lineHeight: '1.3',
          },
        }),
      }),
    );

    onChange.mockClear();
    popup.onSelectHeading('normal');
    expect(onChange.mock.calls[0][0].metadata.captionStyle.color).toBe('#2563eb');
    expect(onChange.mock.calls[0][0].metadata.captionStyle.backgroundColor).toBe('#ccfbf1');
    expect(onChange.mock.calls[0][0].metadata.captionStyle).toMatchObject(CAPTION_STYLE_PRESETS.normal);
  });

  it('writes all governed preset values and callout default background only when none exists', () => {
    const labels = ['Large heading', 'Normal heading', 'Normal text', 'Small text', 'Code block', 'Callout', '"Quote block"'];
    const popupMarkup = renderToStaticMarkup(
      <ClipartCardDraftModal
        isOpen={true}
        padlet={fixturePadlet()}
        onClose={vi.fn()}
        onDiscard={vi.fn()}
        onChange={vi.fn()}
        onReplaceIcon={vi.fn()}
      />,
    );
    const source = sourceFor('components/collabboard/editors/TextStylePopup.tsx');
    for (const label of labels) expect(source).toContain(label);
    expect(popupMarkup).not.toContain('Large heading');

    for (const heading of Object.keys(CAPTION_STYLE_PRESETS) as Array<keyof typeof CAPTION_STYLE_PRESETS>) {
      const onChange = vi.fn();
      const { element } = renderModal({ stateValues: [false, false, false, false, false, true], onChange });
      textStylePopupProps(element).onSelectHeading(heading);
      expect(onChange.mock.calls[0][0].metadata.captionStyle).toEqual(CAPTION_STYLE_PRESETS[heading]);
    }

    const onChange = vi.fn();
    const { element } = renderModal({
      metadata: { captionStyle: { color: '#111827' } },
      stateValues: [false, false, false, false, false, true],
      onChange,
    });
    textStylePopupProps(element).onSelectHeading('callout');
    expect(onChange.mock.calls[0][0].metadata.captionStyle).toEqual({
      color: '#111827',
      ...CAPTION_STYLE_PRESETS.callout,
    });
  });

  it('writes caption text color and highlight without creating caption or opacity fields', () => {
    const onChange = vi.fn();
    const { element } = renderModal({
      metadata: { captionStyle: { fontSize: '18px' } },
      stateValues: [false, false, false, false, false, true],
      onChange,
    });
    const popup = textStylePopupProps(element);

    for (const color of ['#dc2626', '#dc262680', 'transparent']) {
      popup.onSelectColor(color);
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            captionStyle: expect.objectContaining({ fontSize: '18px', color }),
          }),
        }),
      );
      expect(onChange.mock.calls.at(-1)![0].metadata).not.toHaveProperty('caption');
      expect(onChange.mock.calls.at(-1)![0].metadata.captionStyle).not.toHaveProperty('opacity');
    }

    popup.onSelectHighlight('#fef3c7');
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          captionStyle: expect.objectContaining({ fontSize: '18px', backgroundColor: '#fef3c7' }),
        }),
      }),
    );
  });

  it('passes saved caption style to InlineCaption and CardPreview', () => {
    const { element, markup } = renderModal({
      metadata: {
        captionStyle: {
          color: '#111827cc',
          backgroundColor: '#fef3c7',
          fontSize: '18px',
          fontWeight: '700',
          fontStyle: 'italic',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          lineHeight: '1.45',
        },
      },
    });
    const inlineCaption = findByComponentName(inlineCaptionNode(element), 'InlineCaption');

    expect(inlineCaption.props.color).toBe('#111827cc');
    expect(inlineCaption.props.backgroundColor).toBe('#fef3c7');
    expect(inlineCaption.props.textStyle).toMatchObject({
      fontSize: '18px',
      fontWeight: '700',
      fontStyle: 'italic',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      lineHeight: '1.45',
    });
    expect(markup).toContain('color:#111827cc;font-size:18px;font-weight:700;font-style:italic;font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;line-height:1.45;background-color:#fef3c7');
  });

  it('renders InlineCaption inside the compact card and edits previewPadlet.title only', () => {
    const onChange = vi.fn();
    const { element: emptyElement, markup: emptyMarkup } = renderModal({ title: '', onChange });
    const emptyInlineCaption = inlineCaptionNode(emptyElement);
    const emptyInlineCaptionComponent = findByComponentName(emptyInlineCaption, 'InlineCaption');
    expect(emptyInlineCaptionComponent.props.placeholder).toBeUndefined();
    expect(emptyInlineCaptionComponent.props.value).toBe('');
    expect(emptyMarkup).toContain('placeholder="Write a caption..."');
    expect(String(emptyInlineCaption.props.className || '')).not.toContain('w-[320px]');
    expect(findElement(previewWrapperNode(emptyElement), (node) => node.props?.['data-testid'] === 'clipart-inline-caption')).toBeTruthy();

    const { element: filledElement } = renderModal({ title: 'Existing clipart caption', onChange });
    const filledInlineCaptionComponent = findByComponentName(inlineCaptionNode(filledElement), 'InlineCaption');
    expect(filledInlineCaptionComponent.props.value).toBe('Existing clipart caption');

    (filledInlineCaptionComponent.props.onChange as (nextTitle: string) => void)('Edited inline caption');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Edited inline caption',
        metadata: expect.not.objectContaining({
          caption: expect.anything(),
          captionStyle: expect.anything(),
        }),
      }),
    );
    expect(Object.keys(onChange.mock.calls[0][0].metadata || {})).not.toContain('caption');
    expect(Object.keys(onChange.mock.calls[0][0].metadata || {})).not.toContain('captionStyle');
  });

  it('updates toolbar and main-panel badges from the same metadata after adding a comment', () => {
    vi.setSystemTime(new Date('2026-07-29T10:00:00.000Z'));
    const onChange = vi.fn();
    const { element } = renderModal({
      stateValues: [false, false, false, true, false],
      onChange,
    });
    const popup = findByComponentName(element, 'CommentPopup');
    (popup.props.onSubmit as (text: string) => void)('draft comment');

    const [[updated]] = onChange.mock.calls as [[Padlet]];
    const rerendered = renderModal({ metadata: updated.metadata || {} });

    expect(toolbarProps(rerendered.element).commentCount).toBe(1);
    expect(childrenOf(mainBadgeNode(rerendered.element))).toContain(1);
    expect(toolbarProps(rerendered.element).commentBadgeColor).toBe('#facc15');
    expect((mainBadgeNode(rerendered.element)!.props.style as { backgroundColor?: string }).backgroundColor).toBe('#facc15');
  });

  it('updates toolbar and main-panel badge colours from the same metadata after palette selection', () => {
    const onChange = vi.fn();
    const { element } = renderModal({
      metadata: {
        detachedComments: [{ id: 'd1', text: 'existing', userId: 'anon', userName: 'You', timestamp: 1 }],
        badgeColor: '#facc15',
      },
      stateValues: [false, false, false, true, true],
      onChange,
    });
    const colorButton = findElement(element, (node) => node.props?.title === '#fb923c');
    expect(colorButton).toBeTruthy();
    (colorButton!.props.onClick as (event: { stopPropagation: () => void }) => void)({ stopPropagation: vi.fn() });

    const [[updated]] = onChange.mock.calls as [[Padlet]];
    const rerendered = renderModal({ metadata: updated.metadata || {} });

    expect(toolbarProps(rerendered.element).commentCount).toBe(1);
    expect(childrenOf(mainBadgeNode(rerendered.element))).toContain(1);
    expect(toolbarProps(rerendered.element).commentBadgeColor).toBe('#fb923c');
    expect((mainBadgeNode(rerendered.element)!.props.style as { backgroundColor?: string }).backgroundColor).toBe('#fb923c');
  });

  it('keeps detachedComments precedence for both toolbar and main-panel badge', () => {
    const { element } = renderModal({
      metadata: {
        detachedComments: [{ id: 'd1' }, { id: 'd2' }],
        comments: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }],
      },
    });

    expect(toolbarProps(element).commentCount).toBe(2);
    expect(childrenOf(mainBadgeNode(element))).toContain(2);
  });

  it('keeps the main-panel badge on the non-clipping card preview anchor and outside the toolbar subtree', () => {
    const { element } = renderModal({ metadata: { detachedComments: [{ id: 'd1' }] } });
    const mainPanel = mainPanelNode(element);
    const anchor = previewAnchorNode(element);
    const wrapper = previewWrapperNode(element);
    const toolbar = findByComponentName(element, 'CardActionsToolbar');
    const badge = mainBadgeNode(element);

    expect(badge).toBeTruthy();
    expect(String(badge!.props.className)).toContain('h-6');
    expect(String(badge!.props.className)).toContain('w-6');
    expect(String(badge!.props.className)).toContain('-top-2');
    expect(String(badge!.props.className)).toContain('-right-2');
    expect(String(badge!.props.className)).toContain('z-[1200]');
    expect(String(badge!.props.className)).toContain('rounded-full');
    expect(String(badge!.props.className)).toContain('border-2');
    expect(String(badge!.props.className)).toContain('border-white');
    expect(String(badge!.props.className)).toContain('shadow-md');
    expect(findElement(mainPanel, (node) => node.props?.['data-testid'] === 'clipart-main-comment-badge')).toBeTruthy();
    expect(findElement(anchor, (node) => node.props?.['data-testid'] === 'clipart-main-comment-badge')).toBeTruthy();
    expect(findElement(wrapper, (node) => node.props?.['data-testid'] === 'clipart-main-comment-badge')).toBeNull();
    expect(findElement(toolbar, (node) => node.props?.['data-testid'] === 'clipart-main-comment-badge')).toBeNull();
    expect(String(anchor.props.className)).toContain('overflow-visible');
    expect(String(wrapper.props.className)).toContain('overflow-hidden');
  });

  it('centres the whole composition row with m-auto and no governed pt-6 offsets', () => {
    const { element } = renderModal({ stateValues: [true, false, true, true, false, true] });
    const source = sourceFor('components/collabboard/editors/ClipartCardDraftModal.tsx');
    const row = compositionRowNode(element);
    const toolbarWrapper = testIdNode(element, 'clipart-toolbar-wrapper');
    const mainPanel = mainPanelNode(element);
    const commentsPanel = testIdNode(element, 'clipart-comments-panel');
    const colorPanel = testIdNode(element, 'clipart-color-panel-wrapper');
    const reactionPanel = testIdNode(element, 'clipart-reaction-panel-wrapper');
    const captionPanel = testIdNode(element, 'clipart-caption-style-panel');

    expect(String(row.props.className)).toContain('m-auto');
    expect(String(row.props.className)).toContain('items-start');
    expect(source).toContain('flex items-start justify-center overflow-auto p-4');
    expect(source).not.toContain('fixed inset-0 z-[160] flex items-center justify-center');
    expect(source).not.toContain('useEffect');
    expect(source).not.toMatch(/getBoundingClientRect\(|ResizeObserver|offsetHeight|offsetWidth/);

    for (const [label, node] of [
      ['toolbar', toolbarWrapper],
      ['main panel', mainPanel],
      ['comments', commentsPanel],
      ['color panel', colorPanel],
      ['reaction panel', reactionPanel],
      ['caption panel', captionPanel],
    ] as const) {
      expect(node, `${label} wrapper should render in this state`).toBeTruthy();
      expect(String(node!.props.className || ''), `${label} wrapper should not use pt-6`).not.toContain('pt-6');
    }

    expect(source).not.toMatch(/data-testid="clipart-toolbar-wrapper"[\s\S]{0,80}pt-6/);
    expect(source).not.toMatch(/data-testid="clipart-color-panel-wrapper"[\s\S]{0,80}pt-6/);
    expect(source).not.toMatch(/data-testid="clipart-reaction-panel-wrapper"[\s\S]{0,80}pt-6/);
    expect(source).not.toMatch(/data-testid="clipart-comments-panel"[\s\S]{0,80}pt-6/);
  });

  it('aligns the compact main panel and comments panel without an independent comments offset', () => {
    const { element } = renderModal({ stateValues: [false, false, false, true, false] });
    const mainPanel = mainPanelNode(element);
    const commentsPanel = testIdNode(element, 'clipart-comments-panel');
    const source = sourceFor('components/collabboard/editors/ClipartCardDraftModal.tsx');

    expect(commentsPanel).toBeTruthy();
    expect(String(mainPanel.props.className)).not.toContain('pt-');
    expect(String(commentsPanel!.props.className)).not.toContain('pt-6');
    expect(String(commentsPanel!.props.className)).toContain('relative');
    expect((commentsPanel!.props.style as { minWidth?: string }).minWidth).toBe('320px');
    expect(source).toContain('relative m-auto flex max-w-[calc(100vw-80px)] items-start gap-6');
    expect(source).not.toContain('max-h-[calc(100vh-80px)]');
    expect(source).toContain('flex items-start justify-center overflow-auto p-4');
    expect(source).not.toContain('items-center justify-center p-4');
    expect(source).not.toContain('min-h-[520px]');
  });

  it('opens Comments from the card-corner badge without writing metadata or closing the draft', () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    const { element } = renderModal({
      metadata: {
        detachedComments: [{ id: 'd1', text: 'existing', userId: 'anon', userName: 'You', timestamp: 1 }],
        badgeColor: '#fb923c',
      },
      onChange,
      onClose,
    });
    const badge = mainBadgeNode(element);
    expect(badge).toBeTruthy();
    expect(badge!.type).toBe('button');
    expect(badge!.props.type).toBe('button');
    expect(badge!.props['aria-label']).toBe('Open comments, 1 comments');

    const stopPropagation = vi.fn();
    (badge!.props.onClick as (event: { stopPropagation: () => void }) => void)({ stopPropagation });

    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(state.calls).toContainEqual({ index: 3, value: true });
    expect(state.calls).toContainEqual({ index: 2, value: false });
    expect(state.calls).toContainEqual({ index: 0, value: false });
    expect(onChange).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('uses the same Comments state path for toolbar and card badge entry points', () => {
    const { element } = renderModal({ metadata: { detachedComments: [{ id: 'd1' }] } });
    const toolbar = toolbarProps(element);
    const badge = mainBadgeNode(element);

    toolbar.onComment();
    const toolbarCalls = [...state.calls];

    resetState();
    (badge!.props.onClick as (event: { stopPropagation: () => void }) => void)({ stopPropagation: vi.fn() });
    expect(state.calls).toEqual(toolbarCalls);
  });

  it('passes default and saved badge colour to the toolbar', () => {
    const defaultColour = renderModal({ metadata: { detachedComments: [{ id: 'd1' }] } });
    expect(toolbarProps(defaultColour.element).commentBadgeColor).toBe('#facc15');

    const savedColour = renderModal({ metadata: { detachedComments: [{ id: 'd1' }], badgeColor: '#fb923c' } });
    expect(toolbarProps(savedColour.element).commentBadgeColor).toBe('#fb923c');
  });

  it('selecting a badge colour writes only metadata.badgeColor and leaves comment panel open', () => {
    const onChange = vi.fn();
    const { element } = renderModal({
      metadata: {
        comments: [{ id: 'legacy-comment' }],
        detachedComments: [{ id: 'd1', text: 'existing', userId: 'anon', userName: 'You', timestamp: 1 }],
        badgeColor: '#facc15',
      },
      stateValues: [false, false, false, true, true],
      onChange,
    });
    const swatch = findElement(element, (node) => node.props?.title === 'Badge Color');
    expect(swatch).toBeTruthy();
    (swatch!.props.onClick as (event: { stopPropagation: () => void }) => void)({ stopPropagation: vi.fn() });
    expect(state.calls).toContainEqual({ index: 4, value: false });

    const colorButton = findElement(element, (node) => node.props?.title === '#fb923c');
    expect(colorButton).toBeTruthy();
    (colorButton!.props.onClick as (event: { stopPropagation: () => void }) => void)({ stopPropagation: vi.fn() });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          badgeColor: '#fb923c',
          comments: [{ id: 'legacy-comment' }],
        }),
      }),
    );
    expect(state.calls).toContainEqual({ index: 4, value: false });
  });

  it('closing panels leaves the draft modal open', () => {
    const onClose = vi.fn();
    const reactionTree = renderModal({ stateValues: [false, false, true, false, false], onClose });
    const pickerClose = findElement(reactionTree.element, (node) => node.props?.title === 'Close');
    expect(pickerClose).toBeTruthy();
    (pickerClose!.props.onClick as () => void)();
    expect(onClose).not.toHaveBeenCalled();
    expect(findByComponentName(reactionTree.element, 'CardActionsToolbar')).toBeTruthy();

    const commentTree = renderModal({ stateValues: [false, false, false, true, false], onClose });
    const popup = findByComponentName(commentTree.element, 'CommentPopup');
    (popup.props.onOpenChange as (open: boolean) => void)(false);
    expect(onClose).not.toHaveBeenCalled();
    expect(findByComponentName(commentTree.element, 'CardActionsToolbar')).toBeTruthy();
  });

  it('keeps Color, Icon, and Card view actions functional', () => {
    const onReplaceIcon = vi.fn();
    const { element } = renderModal({ onReplaceIcon });
    const props = toolbarProps(element);

    props.onColorClick({ stopPropagation: vi.fn() }, 'topstrip');
    expect(state.calls).toContainEqual({ index: 0, value: true });

    props.onReplaceIcon();
    expect(onReplaceIcon).toHaveBeenCalledTimes(1);

    props.onToggleCardView();
    expect(state.calls).toContainEqual({ index: 1, value: true });
  });

  it('omitting new CardActionsToolbar props preserves the existing static rendering shape', () => {
    const omitted = renderToolbar();
    const explicitlyUndefined = renderToolbar({ commentCount: undefined, commentBadgeColor: undefined });

    expect(omitted).toBe(explicitlyUndefined);
    expect(omitted).not.toContain('absolute -top-1 -right-1');
    expect(omitted).not.toContain('relative w-10 h-10');
    expect(omitted).toContain('title="Comment"');
  });

  it('renders comment badge only when count is positive, with default and custom colours', () => {
    expect(renderToolbar({ commentCount: 0 })).not.toContain('>0</span>');
    expect(renderToolbar({ commentCount: 2 })).toContain('background-color:#facc15');
    expect(renderToolbar({ commentCount: 2 })).toContain('>2</span>');
    expect(renderToolbar({ commentCount: 3, commentBadgeColor: '#fb923c' })).toContain('background-color:#fb923c');
    expect(renderToolbar({ commentCount: 3, commentBadgeColor: '#fb923c' })).toContain('>3</span>');
  });

  it('keeps the source guard scoped to ClipartCardDraftModal', () => {
    const source = sourceFor('components/collabboard/editors/ClipartCardDraftModal.tsx');

    expect(source).not.toMatch(/onAddReaction=\{\(\)\s*=>\s*(?:\{\s*\}|undefined|null)\}/);
    expect(source).not.toMatch(/onComment=\{\(\)\s*=>\s*(?:\{\s*\}|undefined|null)\}/);
    expect(source).not.toMatch(/onAddReaction=\{\s*function\s*\([^)]*\)\s*\{\s*\}\s*\}/);
    expect(source).not.toMatch(/onComment=\{\s*function\s*\([^)]*\)\s*\{\s*\}\s*\}/);
  });

  it('uses one shared comment count and colour path without new metadata fields', () => {
    const source = sourceFor('components/collabboard/editors/ClipartCardDraftModal.tsx');

    expect(source.match(/const commentCount =/g)).toHaveLength(1);
    expect(source.match(/const commentBadgeColor =/g)).toHaveLength(1);
    expect(source).toMatch(/commentCount=\{commentCount\}/);
    expect(source).toMatch(/commentBadgeColor=\{commentBadgeColor\}/);
    expect(source).toMatch(/data-testid="clipart-main-comment-badge"[\s\S]*?\{commentCount\}/);
    expect(source).toMatch(/data-testid="clipart-main-comment-badge"[\s\S]*?backgroundColor: commentBadgeColor/);
    expect(source).not.toMatch(/detachedComments\?\.[\s\S]{0,80}comments\?\.[\s\S]{0,80}\+/);
    expect(source).not.toMatch(/updateMetadata\(\{\s*comments:/);
    expect(source).not.toMatch(/badgeColour|commentBadgeColorOverride|mainBadgeColor|mainCommentCount/);
  });

  it('keeps existing toolbar, comment, and reaction behavior unchanged in source', () => {
    const source = sourceFor('components/collabboard/editors/ClipartCardDraftModal.tsx');

    expect(source).toContain('onAddReaction={(e) => {');
    expect(source).toContain('openReactionPicker();');
    expect(source).toContain('onComment={openCommentPanel}');
    expect(source).toContain('updateMetadata({ detachedComments: [...detachedComments, newComment] });');
    expect(source).toContain('data-testid="clipart-comments-panel"');
  });

  it('passes reactions through CardPreview and removes one matching instance per click', () => {
    const onChange = vi.fn();
    const { element } = renderModal({ metadata: { reactions: ['👍', '👍', '🚀'] }, onChange });
    const cardPreview = findByComponentName(element, 'CardPreview');

    expect(cardPreview.props.reactions).toEqual(['👍', '👍', '🚀']);
    expect(typeof cardPreview.props.onAddReaction).toBe('function');
    expect(typeof cardPreview.props.onReactionClick).toBe('function');
    expect(testIdNode(element, 'clipart-reaction-panel-wrapper')).toBeNull();
    expect(findElement(element, (node) => node.props?.['aria-label'] === 'Draft reactions')).toBeNull();

    (cardPreview.props.onReactionClick as (emoji: string) => void)('👍');
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ reactions: ['👍', '🚀'] }),
      }),
    );

    const oneLeft = renderModal({ metadata: { reactions: onChange.mock.calls[0][0].metadata.reactions }, onChange });
    const oneLeftCardPreview = findByComponentName(oneLeft.element, 'CardPreview');
    (oneLeftCardPreview.props.onReactionClick as (emoji: string) => void)('👍');
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ reactions: ['🚀'] }),
      }),
    );

    const rocketLeft = renderModal({ metadata: { reactions: ['🚀', '✨'] }, onChange });
    const rocketCardPreview = findByComponentName(rocketLeft.element, 'CardPreview');
    (rocketCardPreview.props.onReactionClick as (emoji: string) => void)('🚀');
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ reactions: ['✨'] }),
      }),
    );
  });

  it('uses emoji-picker-react parity markup and never imports the in-repo picker', () => {
    const source = sourceFor('components/collabboard/editors/ClipartCardDraftModal.tsx');
    const { element } = renderModal({ stateValues: [false, false, true, false, false] });
    const panel = testIdNode(element, 'clipart-reaction-panel-wrapper');
    const picker = emojiPickerNode(element);
    const close = findElement(panel, (node) => node.props?.title === 'Close');

    expect(source).toContain("import EmojiPicker from 'emoji-picker-react'");
    expect(source).not.toContain('EmojiReactionPicker');
    expect(String(panel!.props.className)).toContain('animate-in fade-in zoom-in duration-200');
    expect(String(childrenOf(panel)[0] && (childrenOf(panel)[0] as ReactNode).props.className)).toContain('relative shadow-2xl rounded-xl overflow-hidden border border-gray-200 bg-white');
    expect(String(close!.props.className)).toContain('absolute top-2 right-2 translate-x-1 z-10 w-4 h-4 rounded hover:bg-gray-100 flex items-center justify-center');
    expect(picker.props.width).toBe(300);
    expect(picker.props.height).toBe(400);
    expect(picker.props.lazyLoadEmojis).toBe(true);
    expect(source).not.toContain('updatePadletMetadata');
  });

  it('CardPreview ReactionDisplay shows duplicate count two for duplicate draft reactions', () => {
    const { markup } = renderModal({ metadata: { reactions: ['👍', '👍'] } });

    expect(markup).toContain('👍');
    expect(markup).toContain('>2</span>');
  });

  it('closes sibling panels when opening caption, reaction, comments, and color panels', () => {
    const { element } = renderModal();
    const toolbar = toolbarProps(element);

    toolbar.onCaption?.();
    expect(state.calls).toContainEqual({ index: 5, value: true });
    expect(state.calls).toContainEqual({ index: 0, value: false });
    expect(state.calls).toContainEqual({ index: 2, value: false });
    expect(state.calls).toContainEqual({ index: 3, value: false });
    expect(state.calls).toContainEqual({ index: 4, value: false });

    resetState();
    toolbar.onAddReaction({ stopPropagation: vi.fn() });
    expect(state.calls).toContainEqual({ index: 2, value: true });
    expect(state.calls).toContainEqual({ index: 3, value: false });
    expect(state.calls).toContainEqual({ index: 0, value: false });
    expect(state.calls).toContainEqual({ index: 4, value: false });
    expect(state.calls).toContainEqual({ index: 5, value: false });

    resetState();
    toolbar.onComment();
    expect(state.calls).toContainEqual({ index: 3, value: true });
    expect(state.calls).toContainEqual({ index: 2, value: false });
    expect(state.calls).toContainEqual({ index: 0, value: false });
    expect(state.calls).toContainEqual({ index: 4, value: false });
    expect(state.calls).toContainEqual({ index: 5, value: false });

    resetState();
    toolbar.onColorClick({ stopPropagation: vi.fn() }, 'background');
    expect(state.calls).toContainEqual({ index: 0, value: true });
    expect(state.calls).toContainEqual({ index: 2, value: false });
    expect(state.calls).toContainEqual({ index: 3, value: false });
    expect(state.calls).toContainEqual({ index: 4, value: false });
    expect(state.calls).toContainEqual({ index: 5, value: false });
  });

  it('switches directly from open sibling panels to the requested toolbar panel in one handler call', () => {
    const captionOpen = renderModal({ stateValues: [false, false, false, false, false, true] });
    toolbarProps(captionOpen.element).onAddReaction({ stopPropagation: vi.fn() });
    expect(state.calls).toContainEqual({ index: 2, value: true });
    expect(state.calls).toContainEqual({ index: 5, value: false });

    resetState();
    toolbarProps(captionOpen.element).onComment();
    expect(state.calls).toContainEqual({ index: 3, value: true });
    expect(state.calls).toContainEqual({ index: 5, value: false });

    resetState();
    toolbarProps(captionOpen.element).onColorClick({ stopPropagation: vi.fn() }, 'background');
    expect(state.calls).toContainEqual({ index: 0, value: true });
    expect(state.calls).toContainEqual({ index: 5, value: false });

    const reactionOpen = renderModal({ stateValues: [false, false, true, false, false, false] });
    toolbarProps(reactionOpen.element).onCaption?.();
    expect(state.calls).toContainEqual({ index: 5, value: true });
    expect(state.calls).toContainEqual({ index: 2, value: false });

    resetState();
    const commentsOpen = renderModal({ stateValues: [false, false, false, true, false, false] });
    toolbarProps(commentsOpen.element).onAddReaction({ stopPropagation: vi.fn() });
    expect(state.calls).toContainEqual({ index: 2, value: true });
    expect(state.calls).toContainEqual({ index: 3, value: false });

    resetState();
    toolbarProps(commentsOpen.element).onCaption?.();
    expect(state.calls).toContainEqual({ index: 5, value: true });
    expect(state.calls).toContainEqual({ index: 3, value: false });

    resetState();
    const colorOpen = renderModal({ stateValues: [true, false, false, false, false, false] });
    toolbarProps(colorOpen.element).onAddReaction({ stopPropagation: vi.fn() });
    expect(state.calls).toContainEqual({ index: 2, value: true });
    expect(state.calls).toContainEqual({ index: 0, value: false });

    resetState();
    toolbarProps(colorOpen.element).onCaption?.();
    expect(state.calls).toContainEqual({ index: 5, value: true });
    expect(state.calls).toContainEqual({ index: 0, value: false });
  });
});

// PATCH-121 — badge-colour palette geometry.
describe('ClipartCardDraftModal badge colour palette geometry', () => {
  const OPEN_COMMENT_PANEL_WITH_PALETTE = [false, false, false, true, true];
  const COLUMNS = 6;
  const SWATCH_PX = 20;
  const GAP_PX = 6;
  const PADDING_PX = 8;
  const EXPECTED_WIDTH_PX = COLUMNS * SWATCH_PX + (COLUMNS - 1) * GAP_PX + PADDING_PX * 2;

  beforeEach(() => {
    resetState();
  });

  function paletteTree() {
    return renderModal({ metadata: { badgeColor: '#facc15' }, stateValues: OPEN_COMMENT_PANEL_WITH_PALETTE }).element;
  }

  function paletteNode(element: ReactNode) {
    const node = findElement(element, (candidate) => candidate.props?.['data-testid'] === 'clipart-badge-color-palette');
    expect(node, 'badge colour palette should render when open').toBeTruthy();
    return node!;
  }

  function gridNode(element: ReactNode) {
    const node = findElement(element, (candidate) => candidate.props?.['data-testid'] === 'clipart-badge-color-grid');
    expect(node, 'badge colour grid should render when open').toBeTruthy();
    return node!;
  }

  function swatchNodes(element: ReactNode): ReactNode[] {
    const found: ReactNode[] = [];
    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      const candidate = node as ReactNode;
      if (candidate.props?.['data-badge-color-swatch']) found.push(candidate);
      childrenOf(candidate).forEach(walk);
    };
    walk(element);
    return found;
  }

  it('states an explicit palette width instead of shrinking to its 28px containing block', () => {
    const style = paletteNode(paletteTree()).props.style as { width?: string };
    expect(style?.width).toBe(`${EXPECTED_WIDTH_PX}px`);
  });

  it('uses six fixed-width grid columns so swatches cannot be compressed', () => {
    const grid = gridNode(paletteTree());
    const style = grid.props.style as { gridTemplateColumns?: string };

    expect(style?.gridTemplateColumns).toBe(`repeat(${COLUMNS}, ${SWATCH_PX}px)`);
    expect(String(grid.props.className)).toContain('gap-1.5');
    // minmax(0,1fr) tracks were the defect: they permit tracks narrower than
    // the swatch, which made swatches overlap and clip.
    expect(style?.gridTemplateColumns).not.toContain('1fr');
    expect(String(grid.props.className)).not.toContain('grid-cols-6');
  });

  it('renders every colour as an equal, non-shrinking swatch with no conflicting minimum', () => {
    const swatches = swatchNodes(paletteTree());
    expect(swatches).toHaveLength(48);
    expect(swatches.length % COLUMNS).toBe(0);

    for (const swatch of swatches) {
      const style = swatch.props.style as Record<string, unknown>;
      expect(style.width).toBe(`${SWATCH_PX}px`);
      expect(style.height).toBe(`${SWATCH_PX}px`);
      // A minWidth larger than width overflowed the track and caused overlap.
      expect(style.minWidth).toBeUndefined();
      expect(style.minHeight).toBeUndefined();
      expect(String(swatch.props.className)).toContain('shrink-0');
    }
  });

  it('fits all six columns within the stated palette width', () => {
    const contentWidth = COLUMNS * SWATCH_PX + (COLUMNS - 1) * GAP_PX;
    expect(contentWidth + PADDING_PX * 2).toBe(EXPECTED_WIDTH_PX);
    expect(EXPECTED_WIDTH_PX).toBeGreaterThanOrEqual(166);
  });

  it('preserves the repository colour set and ordering', () => {
    const source = sourceFor('components/collabboard/editors/ClipartCardDraftModal.tsx');
    const declared = source.match(/const BADGE_COLORS = \[([\s\S]*?)\];/);
    expect(declared).toBeTruthy();
    const colors = declared![1].match(/#[0-9a-f]{6}/gi) ?? [];

    expect(colors).toHaveLength(48);
    expect(colors[0]).toBe('#fef9c3');
    expect(colors[3]).toBe('#facc15');
    expect(colors[colors.length - 1]).toBe('#0d9488');
    expect(swatchNodes(paletteTree()).map((node) => node.props['data-badge-color-swatch'])).toEqual(colors);
  });

  it('keeps propagation guards so the comments panel and draft stay open', () => {
    const palette = paletteNode(paletteTree());
    expect(typeof palette.props.onClick).toBe('function');
    expect(typeof palette.props.onMouseDown).toBe('function');

    const stopPropagation = vi.fn();
    (palette.props.onClick as (event: { stopPropagation: () => void }) => void)({ stopPropagation });
    (palette.props.onMouseDown as (event: { stopPropagation: () => void }) => void)({ stopPropagation });
    expect(stopPropagation).toHaveBeenCalledTimes(2);
  });

  it('still writes only metadata.badgeColor when a widened swatch is clicked', () => {
    const onChange = vi.fn();
    const { element } = renderModal({
      metadata: { badgeColor: '#facc15', comments: [{ id: 'legacy' }] },
      stateValues: OPEN_COMMENT_PANEL_WITH_PALETTE,
      onChange,
    });
    const swatch = swatchNodes(element).find((node) => node.props['data-badge-color-swatch'] === '#3b82f6');
    expect(swatch).toBeTruthy();
    (swatch!.props.onClick as (event: { stopPropagation: () => void }) => void)({ stopPropagation: vi.fn() });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ badgeColor: '#3b82f6', comments: [{ id: 'legacy' }] }),
      }),
    );
    const [[updated]] = onChange.mock.calls as [[{ metadata: Record<string, unknown> }]];
    expect(updated.metadata.detachedComments).toBeUndefined();
  });
});
