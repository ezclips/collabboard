import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Padlet } from '@/types/collabboard';
import ClipartCardDraftModal from './ClipartCardDraftModal';

function fixturePadlet(metadata: Record<string, unknown> = {}): Padlet {
  return {
    id: 'card-1',
    board_id: 'board-1',
    title: 'Library clipart',
    content: '',
    type: 'card',
    position_x: 0,
    position_y: 0,
    width: 180,
    height: 220,
    metadata: {
      svgUrl: '/clipart.svg',
      iconBgColor: '#ec4899',
      ...metadata,
    },
    created_at: '2026-07-29T00:00:00.000Z',
    updated_at: '2026-07-29T00:00:00.000Z',
  } as Padlet;
}

function renderTitleInputStyle(metadata: Record<string, unknown> = {}): string {
  const markup = renderToStaticMarkup(
    <ClipartCardDraftModal
      isOpen={true}
      padlet={fixturePadlet(metadata)}
      onClose={vi.fn()}
      onDiscard={vi.fn()}
      onChange={vi.fn()}
      onReplaceIcon={vi.fn()}
    />,
  );
  const match = markup.match(/data-testid="clipart-post-name-input"[^>]*style="([^"]*)"/);
  expect(match, 'the post-name input should render').toBeTruthy();
  return match?.[1] ?? '';
}

describe('ClipartCardDraftModal post-name readability on the strip (PATCH-295)', () => {
  it('uses light text on the default indigo strip when no colour is chosen', () => {
    expect(renderTitleInputStyle()).toBe('color:#f8fafc');
  });

  it('uses dark text on a light strip', () => {
    expect(renderTitleInputStyle({ topStripColor: '#fde68a' })).toBe('color:#1e293b');
  });

  it('lets a chosen metadata.textColor win over the strip contrast', () => {
    expect(renderTitleInputStyle({ textColor: '#ff0000' })).toBe('color:#ff0000');
  });

  it('lets a chosen titleStyle.color win over the strip contrast', () => {
    expect(renderTitleInputStyle({ titleStyle: { color: '#ff0000' } })).toBe('color:#ff0000');
  });

  it('keeps the legacy dark default when the strip is transparent', () => {
    expect(renderTitleInputStyle({ topStripColor: 'transparent' })).toBe('color:#1F2937');
  });
});
