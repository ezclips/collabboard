"use client";

import React, { useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';

import { mediaPostVideoIdentity } from '@/lib/domain/knowledge/mediaPostVideoIdentity';
import { registerBoardVideoPlayer } from './boardVideoPlayerRegistry';

const ReactPlayer = dynamic(() => import('react-player'), { ssr: false });

/**
 * A board video that a transcript citation can jump to.
 *
 * The same ReactPlayer the media card always rendered, plus a registration, so
 * clicking "7:50" beside an answer moves THIS player instead of opening a tab.
 *
 * ============================================================================
 * THE INSTANCE COMES FROM onReady, NOT FROM A ref
 * ============================================================================
 *
 * `ReactPlayer` is loaded through `next/dynamic`, and a dynamic component does
 * not reliably forward refs -- a `ref` here would be null exactly when it was
 * needed, and the failure would look like "seeking does not work sometimes"
 * rather than like a ref problem. ReactPlayer v2 hands its own instance to
 * `onReady`, which is available whether or not the wrapper forwards anything.
 *
 * It is also the RIGHT moment: before ready, `seekTo` on a YouTube player is
 * dropped silently, so registering earlier would mean a citation that appears
 * to do nothing on a card that has not finished loading.
 */
export interface BoardSeekableVideoProps {
  readonly url: string;
  readonly disableInteraction?: boolean;
}

interface ReactPlayerInstance {
  seekTo(amount: number, type?: 'seconds' | 'fraction', keepPlaying?: boolean): void;
  getInternalPlayer(key?: string): unknown;
}

/** The two YouTube IFrame API calls this needs, and nothing else. */
interface YouTubeInternalPlayer {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
}

function isYouTubeInternalPlayer(value: unknown): value is YouTubeInternalPlayer {
  return (
    typeof value === 'object'
    && value !== null
    && typeof (value as YouTubeInternalPlayer).seekTo === 'function'
    && typeof (value as YouTubeInternalPlayer).playVideo === 'function'
  );
}

/**
 * Seek AND PLAY. Measured on the live board, 2026-09-22.
 *
 * ReactPlayer's own `seekTo(n, 'seconds')` defaults `keepPlaying` to false,
 * and on a video that has not started it then calls `pause()` straight after
 * the seek. YouTube treats a seek on an unstarted video as "start playing", so
 * the player was started and stopped in the same instant, from outside the
 * frame. On the owner's board that produced "This video is unavailable, Error
 * code 152-18"; driven directly it left the player black and stuck buffering at
 * 0:47. Four variants were tried against the real Audi video:
 *
 *   seekTo then pauseVideo   (the old behaviour)  -> black, buffering, never plays
 *   seekTo(47, true)                             -> plays from 0:47
 *   loadVideoById({startSeconds: 47})            -> plays from 0:47
 *   seekTo(47, true) then playVideo              -> plays from 0:47   <- this one
 *
 * The explicit playVideo is what the person asked for -- they clicked a moment
 * to hear it -- and it does not rely on YouTube's rule that a seek on an
 * unstarted video happens to start it.
 *
 * `allowSeekAhead: true` because nothing is buffered yet on a fresh player, so
 * the seek MUST be allowed to fetch.
 */
export function seekAndPlay(player: ReactPlayerInstance, seconds: number): void {
  const internal = player.getInternalPlayer();
  if (isYouTubeInternalPlayer(internal)) {
    internal.seekTo(seconds, true);
    internal.playVideo();
    return;
  }
  // Not YouTube (Vimeo goes through here). keepPlaying=true at least removes
  // the pause that broke YouTube. This path was NOT measured on a live player.
  player.seekTo(seconds, 'seconds', true);
}

export function BoardSeekableVideo({ url, disableInteraction = false }: BoardSeekableVideoProps) {
  const playerRef = useRef<ReactPlayerInstance | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const unregisterRef = useRef<(() => void) | null>(null);

  /**
   * ONLY A PROVIDER-CANONICAL IDENTITY IS REGISTERED.
   *
   * A transcript stores a video identity only when one could be named with
   * confidence, so registering a URL-shaped fallback here could never match
   * anything -- and if it ever did, it would be a coincidence steering a
   * citation to the wrong video. See mediaPostVideoIdentity for the asymmetry.
   */
  const identity = (() => {
    const resolved = mediaPostVideoIdentity(url);
    return resolved !== null && resolved.canonical ? resolved.identity : null;
  })();

  const handleReady = useCallback(
    (player: unknown) => {
      playerRef.current = player as ReactPlayerInstance;
      if (identity === null) return;
      // Replacing an earlier registration rather than stacking one on top:
      // ReactPlayer calls onReady again after a source change.
      unregisterRef.current?.();
      unregisterRef.current = registerBoardVideoPlayer(identity, {
        seekTo: (seconds) => {
          if (playerRef.current) seekAndPlay(playerRef.current, seconds);
        },
        reveal: () => {
          containerRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        },
      });
    },
    [identity],
  );

  useEffect(
    () => () => {
      // THE UNREGISTER IS THE WHOLE POINT OF THE REF. Without it a card that
      // scrolled out of the tree would stay in the registry, and a citation
      // would "succeed" against a player nobody can see -- which looks
      // identical to the timestamp being ignored.
      unregisterRef.current?.();
      unregisterRef.current = null;
    },
    [],
  );

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden bg-gray-100 ${disableInteraction ? 'pointer-events-none' : ''}`}
    >
      <div className="pt-[56.25%]" />
      <div className="absolute inset-0">
        <ReactPlayer url={url} controls width="100%" height="100%" onReady={handleReady} />
      </div>
    </div>
  );
}

export default BoardSeekableVideo;
