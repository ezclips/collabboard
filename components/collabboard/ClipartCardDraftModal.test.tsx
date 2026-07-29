import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Padlet } from '@/types/collabboard';
import ClipartCardDraftModal from './editors/ClipartCardDraftModal';
import CardActionsToolbar from './editors/CardActionsToolbar';

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

  it('selecting an emoji preserves reactions and prevents duplicates', () => {
    const onChange = vi.fn();
    const { element } = renderModal({
      metadata: { reactions: ['existing', 'new-emoji'], comments: [{ id: 'legacy' }], other: 'preserved' },
      stateValues: [false, false, true, false, false],
      onChange,
    });
    const picker = findByComponentName(element, 'EmojiReactionPicker');

    (picker.props.onSelectEmoji as (emoji: string) => void)('added');
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          reactions: ['existing', 'new-emoji', 'added'],
          comments: [{ id: 'legacy' }],
          other: 'preserved',
        }),
      }),
    );

    onChange.mockClear();
    (picker.props.onSelectEmoji as (emoji: string) => void)('new-emoji');
    expect(onChange).not.toHaveBeenCalled();
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
    const { element } = renderModal({ stateValues: [true, false, true, true, false] });
    const source = sourceFor('components/collabboard/editors/ClipartCardDraftModal.tsx');
    const row = compositionRowNode(element);
    const toolbarWrapper = testIdNode(element, 'clipart-toolbar-wrapper');
    const mainPanel = mainPanelNode(element);
    const commentsPanel = testIdNode(element, 'clipart-comments-panel');
    const colorPanel = testIdNode(element, 'clipart-color-panel-wrapper');
    const reactionPanel = testIdNode(element, 'clipart-reaction-panel-wrapper');

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
    const picker = findByComponentName(reactionTree.element, 'EmojiReactionPicker');
    (picker.props.onOpenChange as (open: boolean) => void)(false);
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
