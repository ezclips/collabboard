// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

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
