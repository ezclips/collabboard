// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { KnowledgeTranscriptCitationLink } from './KnowledgeTranscriptCitationLink';
import type { KnowledgeTranscriptStoredRepresentation } from '@/lib/domain/knowledge/knowledgeTranscriptVersion';

const representation = (
  over: Partial<KnowledgeTranscriptStoredRepresentation> = {},
): KnowledgeTranscriptStoredRepresentation => ({
  representationVersion: 1,
  videoIdentity: 'yt:dQw4w9WgXcQ',
  cues: [
    { charStart: 0, charEnd: 5, startMs: 1000, endMs: 3000 },
    { charStart: 6, charEnd: 11, startMs: 3_725_000, endMs: 3_728_000 },
  ],
  language: null,
  trackKind: 'machine',
  format: 'srt',
  videoAssociation: 'claimed',
  ...over,
});

// No global setup file mounts testing-library's auto-cleanup, so containers
// would otherwise pile up and turn a single match into an ambiguous one.
afterEach(cleanup);

describe('KnowledgeTranscriptCitationLink', () => {
  it('offers the moment when a cue owns the cited range', () => {
    render(<KnowledgeTranscriptCitationLink representation={representation()} charStart={0} charEnd={5} />);

    const link = screen.getByRole('link', { name: /Open at 0:01/ });
    expect(link.getAttribute('href')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1s');
    // The destination is a video named by whoever imported the transcript. It
    // does not need to be told which board the reader came from.
    expect(link.getAttribute('rel')).toContain('noreferrer');
  });

  it('formats past an hour as h:mm:ss', () => {
    render(<KnowledgeTranscriptCitationLink representation={representation()} charStart={6} charEnd={11} />);
    expect(screen.getByRole('link', { name: /Open at 1:02:05/ })).toBeTruthy();
  });

  it('renders NO link when no cue owns the range', () => {
    // Offset 5 is the separator between two cues: nobody said it. A
    // nearest-cue guess would link to a moment nobody quoted, and nothing
    // about that link would look wrong.
    render(<KnowledgeTranscriptCitationLink representation={representation()} charStart={5} charEnd={6} />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renders NO link for a plain transcript', () => {
    render(
      <KnowledgeTranscriptCitationLink
        representation={representation({ cues: [], format: 'plain', videoIdentity: null })}
        charStart={0}
        charEnd={4}
      />,
    );
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renders NO link when the claimed identity is malformed', () => {
    render(
      <KnowledgeTranscriptCitationLink
        representation={representation({ videoIdentity: 'yt:nope' })}
        charStart={0}
        charEnd={5}
      />,
    );
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('shows the disclosure in EVERY case, link or not', () => {
    // A reader who saw it only beside timestamps would reasonably conclude the
    // rest had been checked.
    for (const props of [
      { representation: representation(), charStart: 0, charEnd: 5 },
      { representation: representation(), charStart: 5, charEnd: 6 },
      { representation: representation({ cues: [], videoIdentity: null }), charStart: 0, charEnd: 1 },
      { representation: representation({ videoIdentity: 'bad' }), charStart: 0, charEnd: 5 },
    ]) {
      const { unmount } = render(<KnowledgeTranscriptCitationLink {...props} />);
      expect(screen.getByText(/User-provided transcript/)).toBeTruthy();
      expect(screen.getByText(/has not been verified/)).toBeTruthy();
      unmount();
    }
  });
});
