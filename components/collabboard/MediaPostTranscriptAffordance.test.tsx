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

const renderAffordance = (props: Partial<React.ComponentProps<typeof MediaPostTranscriptAffordance>> = {}) => {
  const onAddTranscript = vi.fn();
  render(
    <MediaPostTranscriptAffordance
      url={YOUTUBE}
      index={[]}
      indexLoaded
      canEdit
      onAddTranscript={onAddTranscript}
      {...props}
    />,
  );
  return { onAddTranscript };
};

afterEach(cleanup);

describe('MediaPostTranscriptAffordance', () => {
  it('offers the paste on a media card with no transcript', () => {
    const { onAddTranscript } = renderAffordance();
    const button = screen.getByRole('button', { name: 'Add transcript' });
    fireEvent.click(button);
    // The URL travels with the request: the panel needs it to claim the video.
    expect(onAddTranscript).toHaveBeenCalledWith(YOUTUBE);
  });

  it('shows nothing at all on a card that is not media', () => {
    renderAffordance({ url: 'https://example.com/an-article' });
    expect(screen.queryByTestId('transcript-affordance')).toBeNull();
  });

  it('SHOWS NOTHING WHILE THE INDEX IS UNREAD, rather than claiming there is no transcript', () => {
    // The lesson this repository has recorded three times: a failure and an
    // answer must not converge. `indexLoaded` is false both while loading and
    // after a failed read, and in neither case do we know.
    renderAffordance({ indexLoaded: false, index: [entry()] });
    expect(screen.queryByTestId('transcript-affordance')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add transcript' })).toBeNull();
  });

  it('reports a transcript this board already has, instead of asking again (W1)', () => {
    renderAffordance({ index: [entry()] });
    expect(screen.getByText('Transcript added')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add transcript' })).toBeNull();
  });

  it('finds that transcript through a different URL shape of the same video', () => {
    renderAffordance({ url: 'https://youtu.be/dQw4w9WgXcQ?si=abc&t=15', index: [entry()] });
    expect(screen.getByText('Transcript added')).toBeTruthy();
  });

  it('says processing, and offers no action while there is nothing to do', () => {
    renderAffordance({ index: [entry({ processingStatus: 'processing' })] });
    expect(screen.getByText('Transcript processing…')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  describe('a failed transcript is not the same as an absent one (W3)', () => {
    it('NAMES the failure rather than reverting to "Add transcript"', () => {
      const { onAddTranscript } = renderAffordance({
        index: [entry({ processingStatus: 'failed' })],
      });
      // The distinction that matters: offering "Add transcript" here would
      // invite the same paste and the same failure, with nothing admitting
      // that a broken document is already stored.
      expect(screen.getByText('Transcript failed to process.')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Add transcript' })).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(onAddTranscript).toHaveBeenCalledWith(YOUTUBE);
    });
  });

  describe('viewers', () => {
    it('are not offered an action they cannot take', () => {
      renderAffordance({ canEdit: false });
      expect(screen.queryByTestId('transcript-affordance')).toBeNull();
    });

    it('still SEE that a transcript exists', () => {
      // Status is a fact about the board, not an editing capability. Hiding it
      // would make a viewer believe the video has nothing attached.
      renderAffordance({ canEdit: false, index: [entry()] });
      expect(screen.getByText('Transcript added')).toBeTruthy();
    });

    it('see a failure without being offered the retry', () => {
      renderAffordance({ canEdit: false, index: [entry({ processingStatus: 'failed' })] });
      expect(screen.getByText('Transcript failed to process.')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    });
  });

  it('does not let the click reach the card underneath', () => {
    const onCardClick = vi.fn();
    const onAddTranscript = vi.fn();
    render(
      // The card opens the link and starts a drag on pointer events. Neither
      // is what somebody clicking this meant.
      <div onClick={onCardClick}>
        <MediaPostTranscriptAffordance
          url={YOUTUBE}
          index={[]}
          indexLoaded
          canEdit
          onAddTranscript={onAddTranscript}
        />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add transcript' }));
    expect(onAddTranscript).toHaveBeenCalledTimes(1);
    expect(onCardClick).not.toHaveBeenCalled();
  });
});
