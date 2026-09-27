// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MediaPostTranscriptAffordance } from './MediaPostTranscriptAffordance';
import type { BoardTranscriptIndexEntry } from '@/lib/domain/knowledge/boardTranscriptIndex';

const YOUTUBE = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

const entry = (over: Partial<BoardTranscriptIndexEntry> = {}): BoardTranscriptIndexEntry => ({
  documentId: 'doc-1',
  title: 'A talk',
  videoIdentity: 'yt:dQw4w9WgXcQ',
  format: 'youtube-panel',
  processingStatus: 'ready',
  updatedAt: '2026-09-22T10:00:00.000Z',
  ...over,
});

const renderStatus = (
  props: Partial<React.ComponentProps<typeof MediaPostTranscriptAffordance>> = {},
) => render(<MediaPostTranscriptAffordance url={YOUTUBE} index={[]} indexLoaded {...props} />);

afterEach(cleanup);

describe('MediaPostTranscriptAffordance — status only', () => {
  it('RENDERS NO BUTTON AT ALL; the action lives in the right-click menu', () => {
    // The owner moved "Add transcript" to the link post's context menu, where
    // every other action on a post already lives. A card that grows a button
    // depending on state changes its own layout on a board where cards are
    // dragged, resized and stacked.
    renderStatus({ index: [entry({ processingStatus: 'failed' })] });
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says nothing for media with no transcript', () => {
    // The menu offers the action. A card announcing every video it lacks a
    // transcript for would shout on a board full of links.
    renderStatus();
    expect(screen.queryByTestId('transcript-status')).toBeNull();
  });

  it('says nothing at all on a card that is not media', () => {
    renderStatus({ url: 'https://example.com/an-article', index: [entry()] });
    expect(screen.queryByTestId('transcript-status')).toBeNull();
  });

  it('SHOWS NOTHING WHILE THE INDEX IS UNREAD, rather than claiming anything', () => {
    // `indexLoaded` is false both while loading and after a FAILED read, and in
    // neither case do we know. The shape this repository has recorded three
    // times: a failure and an answer must not converge on one rendering.
    renderStatus({ indexLoaded: false, index: [entry()] });
    expect(screen.queryByTestId('transcript-status')).toBeNull();
  });

  it('reports a transcript the board already has (W1)', () => {
    renderStatus({ index: [entry()] });
    expect(screen.getByText('Transcript added')).toBeTruthy();
  });

  it('finds that transcript through a different URL shape of the same video', () => {
    renderStatus({ url: 'https://youtu.be/dQw4w9WgXcQ?si=abc&t=15', index: [entry()] });
    expect(screen.getByText('Transcript added')).toBeTruthy();
  });

  it('reports processing separately from ready', () => {
    renderStatus({ index: [entry({ processingStatus: 'processing' })] });
    expect(screen.getByText('Transcript processing…')).toBeTruthy();
  });

  it('NAMES a failure rather than staying silent like the absent case', () => {
    // Silence over a failed import leaves the person pasting the same words
    // again, with nothing on screen admitting the first attempt is still there.
    renderStatus({ index: [entry({ processingStatus: 'failed' })] });
    expect(screen.getByText('Transcript failed to process.')).toBeTruthy();
  });

  it('shows status to everyone, because status is a fact and not a capability', () => {
    // There is no longer an edit flag at all: a viewer who cannot open an
    // action menu still needs to know the video has a transcript.
    renderStatus({ index: [entry()] });
    expect(screen.getByTestId('transcript-status')).toBeTruthy();
  });
});

describe('PATCH-200: a ready transcript can be opened from the status line', () => {
  it('with an open callback, the status becomes "Transcript added · Open" and calls it', () => {
    const onOpen = vi.fn();
    renderStatus({ index: [entry()], onOpen });

    const button = screen.getByTestId('transcript-open');
    expect(button.tagName).toBe('BUTTON');
    expect(button.textContent).toContain('Transcript added · Open');
    expect(button.textContent).toContain('✓');

    fireEvent.click(button);
    // The entry's document id, not the URL: identity is what the reader opens.
    expect(onOpen).toHaveBeenCalledWith('doc-1');
  });

  it('stops the click from reaching the card, so it does not select or drag it', () => {
    const onOpen = vi.fn();
    const onCardClick = vi.fn();
    const onCardMouseDown = vi.fn();
    render(
      <div onClick={onCardClick} onMouseDown={onCardMouseDown}>
        <MediaPostTranscriptAffordance url={YOUTUBE} index={[entry()]} indexLoaded onOpen={onOpen} />
      </div>,
    );
    const button = screen.getByTestId('transcript-open');
    fireEvent.mouseDown(button);
    fireEvent.click(button);
    expect(onCardMouseDown).not.toHaveBeenCalled();
    expect(onCardClick).not.toHaveBeenCalled();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('WITHOUT a callback the plain status stays, and there is no button', () => {
    renderStatus({ index: [entry()] });
    expect(screen.getByText('Transcript added')).toBeTruthy();
    expect(screen.queryByTestId('transcript-open')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('every other state is unchanged, callback or not', () => {
    const onOpen = vi.fn();
    renderStatus({ index: [entry({ processingStatus: 'processing' })], onOpen });
    expect(screen.getByText('Transcript processing…')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();

    cleanup();

    renderStatus({ index: [entry({ processingStatus: 'failed' })], onOpen });
    expect(screen.getByText('Transcript failed to process.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
