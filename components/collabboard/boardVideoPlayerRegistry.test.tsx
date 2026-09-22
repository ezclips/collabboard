import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  hasBoardVideoPlayer,
  registerBoardVideoPlayer,
  resetBoardVideoPlayers,
  seekBoardVideo,
} from './boardVideoPlayerRegistry';

afterEach(() => resetBoardVideoPlayers());

const YT = 'yt:8IlJ3v8I4Z8';

describe('the board video player registry', () => {
  it('seeks a registered player and reveals it', () => {
    const seekTo = vi.fn();
    const reveal = vi.fn();
    registerBoardVideoPlayer(YT, { seekTo, reveal });

    expect(seekBoardVideo(YT, 470_000)).toBe(true);
    expect(seekTo).toHaveBeenCalledWith(470);
    expect(reveal).toHaveBeenCalledTimes(1);
  });

  it('ROUNDS DOWN to whole seconds, exactly as the YouTube link does', () => {
    // The click and the link must land on the same frame, or one citation
    // means two different things depending on how it was followed.
    const seekTo = vi.fn();
    registerBoardVideoPlayer(YT, { seekTo });
    seekBoardVideo(YT, 470_900);
    expect(seekTo).toHaveBeenCalledWith(470);
  });

  it('never seeks to a negative time', () => {
    const seekTo = vi.fn();
    registerBoardVideoPlayer(YT, { seekTo });
    seekBoardVideo(YT, -1_000);
    expect(seekTo).toHaveBeenCalledWith(0);
  });

  describe('when nothing can be seeked, it SAYS SO rather than failing silently', () => {
    it('returns false for a video no card holds', () => {
      // The caller's signal to open YouTube instead. It must never be read as
      // "the timestamp was wrong".
      expect(seekBoardVideo(YT, 470_000)).toBe(false);
    });

    it('returns false once the only card has unmounted', () => {
      const unregister = registerBoardVideoPlayer(YT, { seekTo: vi.fn() });
      expect(hasBoardVideoPlayer(YT)).toBe(true);
      unregister();
      // A LEFTOVER REGISTRATION IS THE DANGEROUS CASE: seeking would "succeed"
      // against a player nobody can see, which looks exactly like the citation
      // being ignored.
      expect(hasBoardVideoPlayer(YT)).toBe(false);
      expect(seekBoardVideo(YT, 470_000)).toBe(false);
    });

    it('returns false for a different video', () => {
      registerBoardVideoPlayer(YT, { seekTo: vi.fn() });
      expect(seekBoardVideo('yt:dQw4w9WgXcQ', 1_000)).toBe(false);
    });
  });

  describe('several cards of one video', () => {
    it('seeks ALL of them, so the board cannot contradict itself', () => {
      // One card at 7:50 and another still at 0:00 is a board showing two
      // answers to the question that was just asked.
      const first = vi.fn();
      const second = vi.fn();
      registerBoardVideoPlayer(YT, { seekTo: first });
      registerBoardVideoPlayer(YT, { seekTo: second });

      expect(seekBoardVideo(YT, 60_000)).toBe(true);
      expect(first).toHaveBeenCalledWith(60);
      expect(second).toHaveBeenCalledWith(60);
    });

    it('reveals only ONE, because revealing several is not possible', () => {
      const revealA = vi.fn();
      const revealB = vi.fn();
      registerBoardVideoPlayer(YT, { seekTo: vi.fn(), reveal: revealA });
      registerBoardVideoPlayer(YT, { seekTo: vi.fn(), reveal: revealB });

      seekBoardVideo(YT, 60_000);
      expect(revealA.mock.calls.length + revealB.mock.calls.length).toBe(1);
    });

    it('unregistering one leaves the other working', () => {
      const surviving = vi.fn();
      const unregister = registerBoardVideoPlayer(YT, { seekTo: vi.fn() });
      registerBoardVideoPlayer(YT, { seekTo: surviving });
      unregister();

      expect(seekBoardVideo(YT, 30_000)).toBe(true);
      expect(surviving).toHaveBeenCalledWith(30);
    });

    it('ONE BROKEN PLAYER DOES NOT STOP THE OTHERS', () => {
      // A player mid-unmount can throw. The usual outcome is that the next one
      // is fine, and losing the whole seek over it would be the worse trade.
      const healthy = vi.fn();
      registerBoardVideoPlayer(YT, {
        seekTo: () => {
          throw new Error('player is gone');
        },
      });
      registerBoardVideoPlayer(YT, { seekTo: healthy });

      expect(seekBoardVideo(YT, 30_000)).toBe(true);
      expect(healthy).toHaveBeenCalledWith(30);
    });

    it('reports false when EVERY player throws', () => {
      registerBoardVideoPlayer(YT, {
        seekTo: () => {
          throw new Error('player is gone');
        },
      });
      // Nothing moved, so the caller must fall back rather than believe it did.
      expect(seekBoardVideo(YT, 30_000)).toBe(false);
    });
  });

  it('a player with no reveal still seeks', () => {
    const seekTo = vi.fn();
    registerBoardVideoPlayer(YT, { seekTo });
    expect(seekBoardVideo(YT, 1_000)).toBe(true);
    expect(seekTo).toHaveBeenCalledWith(1);
  });
});
