// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LinkPostContextMenu } from './menus/LinkPostContextMenu';
import type { Padlet } from '@/types/collabboard';

/**
 * THE TRANSCRIPT ITEM IS GREYED OUT, NEVER ABSENT.
 *
 * Owner decision, 2026-09-22, after using it: the item VANISHED once a video
 * had a transcript, which reads as the feature being missing rather than as
 * the work being done -- and a menu whose items come and go teaches nobody
 * where anything is.
 *
 * The one case where it is still absent is a post that is not media at all,
 * because there is no transcript to be had and a permanently dead row on every
 * article link is noise rather than guidance.
 */
const padlet = () =>
  ({ id: 'p1', type: 'link', metadata: { linkUrl: 'https://youtu.be/dQw4w9WgXcQ' } }) as unknown as Padlet;

const openMenu = (props: Record<string, unknown> = {}) => {
  render(
    <LinkPostContextMenu padlet={padlet()} onSelect={vi.fn()} {...props}>
      <div data-testid="trigger">card</div>
    </LinkPostContextMenu>,
  );
  fireEvent.contextMenu(screen.getByTestId('trigger'));
};

afterEach(cleanup);

describe('the transcript item in the link post context menu', () => {
  it('is absent on a post that is not media', () => {
    // The host passes no handler at all for an article link.
    openMenu();
    expect(screen.queryByText('Add transcript')).toBeNull();
    expect(screen.queryByText('Transcript added')).toBeNull();
  });

  it('is offered when the video has no transcript yet', () => {
    const onAddTranscript = vi.fn();
    openMenu({ onAddTranscript, transcriptActionLabel: 'Add transcript' });
    const item = screen.getByText('Add transcript');
    fireEvent.click(item);
    expect(onAddTranscript).toHaveBeenCalledTimes(1);
  });

  it('STAYS VISIBLE but disabled once a transcript exists, naming the reason', () => {
    const onAddTranscript = vi.fn();
    openMenu({
      onAddTranscript,
      transcriptActionLabel: 'Transcript added',
      transcriptActionDisabled: true,
    });
    // Present -- the capability is still discoverable.
    const item = screen.getByText('Transcript added');
    expect(item).toBeTruthy();
    // And inert: a disabled item must not run the action behind it.
    fireEvent.click(item);
    expect(onAddTranscript).not.toHaveBeenCalled();
  });

  it('says "processing" rather than offering a duplicate paste', () => {
    const onAddTranscript = vi.fn();
    openMenu({
      onAddTranscript,
      transcriptActionLabel: 'Transcript processing…',
      transcriptActionDisabled: true,
    });
    expect(screen.getByText('Transcript processing…')).toBeTruthy();
    fireEvent.click(screen.getByText('Transcript processing…'));
    expect(onAddTranscript).not.toHaveBeenCalled();
  });

  it('offers a RETRY after a failure, which is a different thing from a first attempt', () => {
    const onAddTranscript = vi.fn();
    openMenu({ onAddTranscript, transcriptActionLabel: 'Retry transcript' });
    fireEvent.click(screen.getByText('Retry transcript'));
    expect(onAddTranscript).toHaveBeenCalledTimes(1);
  });
});
