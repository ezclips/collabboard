import { describe, expect, it, vi } from 'vitest';

import { seekAndPlay } from './BoardSeekableVideo';
import { transcriptSourceUrl } from './MediaPostTranscriptDialog';

describe('seekAndPlay — clicking a cited moment must PLAY it', () => {
  /**
   * Measured on the live board 2026-09-22: ReactPlayer's seekTo(n, 'seconds')
   * pauses straight after seeking an unstarted video, which left the player
   * black and stuck buffering (and, on the owner's screen, YouTube error
   * 152-18). Seek-then-play was the variant verified to play from 0:47, and
   * the real citation chip was then clicked end to end: unstarted -> buffering
   * -> playing, 47s -> 49s, no errors.
   */
  const youtube = () => {
    const calls: string[] = [];
    const internal = {
      seekTo: vi.fn((s: number, ahead: boolean) => calls.push(`seekTo(${s},${ahead})`)),
      playVideo: vi.fn(() => calls.push('playVideo')),
      pauseVideo: vi.fn(() => calls.push('pauseVideo')),
    };
    const player = { seekTo: vi.fn(), getInternalPlayer: () => internal };
    return { player, internal, calls };
  };

  it('seeks with seek-ahead allowed, then plays, in that order', () => {
    const { player, calls } = youtube();
    seekAndPlay(player, 47);
    expect(calls).toEqual(['seekTo(47,true)', 'playVideo']);
  });

  it('NEVER PAUSES, and never takes the ReactPlayer path that does', () => {
    const { player, internal } = youtube();
    seekAndPlay(player, 47);
    expect(internal.pauseVideo).not.toHaveBeenCalled();
    // ReactPlayer's own seekTo is the one that paused. Reverting to it is the
    // regression this test exists to catch.
    expect(player.seekTo).not.toHaveBeenCalled();
  });

  it('falls back to a keep-playing seek for a non-YouTube player', () => {
    const player = { seekTo: vi.fn(), getInternalPlayer: () => ({ setCurrentTime: vi.fn() }) };
    seekAndPlay(player, 12);
    expect(player.seekTo).toHaveBeenCalledWith(12, 'seconds', true);
  });
});

describe('transcriptSourceUrl — "Open the video" goes where the transcript is', () => {
  it('turns a Shorts link into the ordinary watch page', () => {
    // Found by the owner: the Shorts player has no "Show transcript" control,
    // so they had to rewrite /shorts/ to watch?v= by hand.
    expect(transcriptSourceUrl('https://www.youtube.com/shorts/XRIcLyFhosI')).toBe(
      'https://www.youtube.com/watch?v=XRIcLyFhosI',
    );
  });

  it.each([
    'https://youtu.be/XRIcLyFhosI?si=abc',
    'https://www.youtube.com/embed/XRIcLyFhosI',
    'https://www.youtube.com/watch?v=XRIcLyFhosI&t=42&utm_source=x',
  ])('normalises %s to the same clean watch page', (url) => {
    expect(transcriptSourceUrl(url)).toBe('https://www.youtube.com/watch?v=XRIcLyFhosI');
  });

  it('leaves a non-YouTube link untouched', () => {
    expect(transcriptSourceUrl('https://vimeo.com/123456789')).toBe('https://vimeo.com/123456789');
  });
});
