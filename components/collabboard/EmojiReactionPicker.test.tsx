import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import EmojiReactionPicker from './editors/EmojiReactionPicker';

const renderState = vi.hoisted(() => ({
  values: [] as unknown[],
  nextIndex: 0,
}));

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    default: actual,
    useState: <T,>(initial: T) => {
      const index = renderState.nextIndex++;
      const value = index < renderState.values.length ? renderState.values[index] as T : initial;
      return [value, vi.fn()] as const;
    },
  };
});

const reactionFiles = [
  'components/collabboard/canvas/ui/FreeformPadletCards.tsx',
  'components/collabboard/editors/ClipartCardDraftModal.tsx',
  'app/dashboard/canvas/[id]/CanvasClient.tsx',
  'components/collabboard/editors/NoteEditor.tsx',
  'components/collabboard/editors/TodoEditor.tsx',
  'components/collabboard/editors/LinkEditor.tsx',
] as const;

const nonReactionConsumers = [
  'components/collabboard/canvas/IconSelector.tsx',
  'app/dashboard/page.tsx',
  'components/collabboard/editors/CommentEditor.tsx',
] as const;

function source(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function renderPicker({ category = 'frequent', search = '' } = {}): string {
  renderState.values = [category, search];
  renderState.nextIndex = 0;
  return renderToStaticMarkup(
    <EmojiReactionPicker
      isOpen={true}
      onOpenChange={vi.fn()}
      onSelectEmoji={vi.fn()}
      inline
    />,
  );
}

function emojiButtonCount(markup: string): number {
  return (markup.match(/text-xl hover:bg-gray-100/g) ?? []).length;
}

describe('EmojiReactionPicker PATCH-125 census', () => {
  it('migrates all ten governed reaction render sites to EmojiReactionPicker', () => {
    const counts = Object.fromEntries(
      reactionFiles.map((file) => [
        file,
        (source(file).match(/<EmojiReactionPicker\b/g) ?? []).length,
      ]),
    );

    expect(counts).toEqual({
      'components/collabboard/canvas/ui/FreeformPadletCards.tsx': 5,
      'components/collabboard/editors/ClipartCardDraftModal.tsx': 1,
      'app/dashboard/canvas/[id]/CanvasClient.tsx': 1,
      'components/collabboard/editors/NoteEditor.tsx': 1,
      'components/collabboard/editors/TodoEditor.tsx': 1,
      'components/collabboard/editors/LinkEditor.tsx': 1,
    });
  });

  it('keeps emoji-picker-react out of post Reaction paths', () => {
    for (const file of reactionFiles) {
      const text = source(file);
      expect(text).not.toContain('emoji-picker-react');
      expect(text).not.toContain('<EmojiPicker');
      expect(text).not.toContain('onEmojiClick=');
    }
  });

  it('leaves the three non-reaction emoji-picker-react consumers unchanged', () => {
    const purposes = nonReactionConsumers.map((file) => source(file));

    expect(purposes[0]).toContain('Select Icon');
    expect(purposes[0]).toContain('emoji-picker-react');
    expect(purposes[1]).toContain('setNewFolderIcon');
    expect(purposes[1]).toContain('emoji-picker-react');
    expect(purposes[2]).toContain('handleEmojiClick');
    expect(purposes[2]).toContain('emoji-picker-react');
  });

  it('does not remove emoji-picker-react from package files', () => {
    expect(source('package.json')).toContain('"emoji-picker-react"');
    expect(source('package-lock.json')).toContain('"emoji-picker-react"');
    const diff = execFileSync('git', ['diff', '--', 'package.json', 'package-lock.json'], { encoding: 'utf8' });
    const removedLines = diff.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---'));
    expect(removedLines.find((l) => l.includes('emoji-picker-react'))).toBeUndefined();
  });
});

describe('EmojiReactionPicker shared structure and search', () => {
  it('renders the same compact inline structure and dimensions for every consumer', () => {
    const markup = renderPicker();

    expect(markup).toContain('Add Reaction');
    expect(markup).toContain('w-[360px]');
    expect(markup).toContain('h-[350px]');
    expect(markup).toContain('Search emojis...');
    expect(markup).toContain('Frequently used');
    expect(emojiButtonCount(markup)).toBe(10);
  });

  it('trims search text and searches case-insensitively', () => {
    const markup = renderPicker({ search: '  SMILE  ' });

    expect(markup).not.toContain('No emojis found');
    expect(emojiButtonCount(markup)).toBeGreaterThan(1);
  });

  it('finds smile, heart, fire, and thumbs-up terms', () => {
    for (const search of ['smile', 'heart', 'fire', 'thumbs up']) {
      const markup = renderPicker({ search });
      expect(markup, search).not.toContain('No emojis found');
      expect(emojiButtonCount(markup), search).toBeGreaterThan(0);
    }
  });

  it('keeps emoji glyph search working and handles no-match queries', () => {
    const fireMarkup = renderPicker({ search: 'fire' });
    const fireGlyph = fireMarkup.match(/title="([^"]+)">\1<\/button>/)?.[1] ?? '';
    expect(fireGlyph.length).toBeGreaterThan(0);
    expect(renderPicker({ search: fireGlyph })).not.toContain('No emojis found');
    expect(renderPicker({ search: 'definitely-not-an-emoji' })).toContain('No emojis found');
  });
});

describe('EmojiReactionPicker semantics and persistence source guards', () => {
  it('preserves append semantics and routes for Image, Card Post Modal, Clipart, and CanvasClient', () => {
    const freeform = source('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
    const clipart = source('components/collabboard/editors/ClipartCardDraftModal.tsx');
    const canvasClient = source('app/dashboard/canvas/[id]/CanvasClient.tsx');

    expect((freeform.match(/newReactions = \[\.\.\.currentReactions, emoji\]/g) ?? []).length).toBe(5);
    expect(freeform).toContain('updatePostFieldsPreservingFailureChannels(padlet.id');
    expect(freeform).toContain('updatePostFieldsPreservingFailureChannels(activeImageToolbarPadlet.id');
    expect((freeform.match(/await updatePadletMetadata\(padlet\.id, \{ reactions: newReactions \}\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(freeform).toContain('updatePadletMetadata(activeCardToolbarPadlet.id, { reactions: newReactions })');
    expect(clipart).toContain('updateMetadata({ reactions: [...reactions, emoji] });');
    expect(canvasClient).toContain('updatePadletMetadata(activeImageToolbarPadlet.id, { reactions: newReactions })');
  });

  it('preserves Note dedup-append and Todo/Link toggle semantics', () => {
    const note = source('components/collabboard/editors/NoteEditor.tsx');
    const todo = source('components/collabboard/editors/TodoEditor.tsx');
    const link = source('components/collabboard/editors/LinkEditor.tsx');

    expect(note).toContain('if (!reactions.includes(emoji))');
    expect(note).toContain('setReactions([...reactions, emoji]);');
    expect(todo).toContain('const toggleReaction = (emoji: string) => {');
    expect(todo).toContain('prev.includes(emoji)');
    expect(link).toContain('const toggleReaction = (emoji: string) => {');
    expect(link).toContain('prev.includes(emoji)');
  });
});
