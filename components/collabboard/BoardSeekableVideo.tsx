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
  seekTo(amount: number, type?: 'seconds' | 'fraction'): void;
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
        seekTo: (seconds) => playerRef.current?.seekTo(seconds, 'seconds'),
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
