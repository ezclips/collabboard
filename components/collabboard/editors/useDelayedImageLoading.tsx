"use client";

import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * R6H -- a delayed loading indicator for images that take a moment to arrive.
 *
 * R6B images created from a PDF area selection are served through the
 * authenticated same-origin route and answer `Cache-Control: private,
 * no-store`, so the browser is FORBIDDEN from reusing the response. Every first
 * paint is a real round trip, which is the 1-2s blank area the user reported.
 *
 * Two things make this subtle enough to be worth its own module:
 *
 *  1. It must not flash. Ordinary images -- public URLs, and the flattened
 *     `data:` composite R6D introduced -- resolve fast enough that a spinner
 *     shown immediately would appear and vanish as a blink. So nothing is shown
 *     for a short threshold; only an image still in flight after it gets an
 *     indicator.
 *
 *  2. It must not cost a request. R6D deliberately cut this editor from six
 *     image requests to three by keeping the main <img> mounted across subtool
 *     open/close. Constructing `new Image()` to observe loading, or adding a
 *     cache-buster, would hand that back. This rides the EXISTING element's own
 *     load/error events, and reads `complete` for the case where the browser
 *     finished before React attached a handler.
 */

/** How long an image may take before it earns an indicator. */
export const IMAGE_LOADING_INDICATOR_DELAY_MS = 250;

export interface DelayedImageLoading {
  /** True only once the image is BOTH still loading and past the threshold. */
  readonly showIndicator: boolean;
  /** Spread onto the <img>. Adds no request -- only a ref and two listeners. */
  readonly imgProps: {
    ref: React.RefObject<HTMLImageElement | null>;
    onLoad: () => void;
    onError: () => void;
  };
  /** For callers with their own onLoad/onError: tell the hook it settled. */
  readonly markSettled: () => void;
}

/**
 * Tracks whether `src` is still loading, revealing an indicator only after
 * IMAGE_LOADING_INDICATOR_DELAY_MS.
 *
 * Pass the RESOLVED display source, not the raw metadata: R6D can prefer a
 * flattened `data:` composite over the private route, and that composite is
 * available immediately. Watching the wrong one would spin over an image that
 * is already on screen.
 */
export function useDelayedImageLoading(src: string | null | undefined): DelayedImageLoading {
  const imgRef = React.useRef<HTMLImageElement | null>(null);
  const [settled, setSettled] = React.useState(false);
  const [pastThreshold, setPastThreshold] = React.useState(false);

  // Keyed on src: a new source is a new load, and the previous one's indicator
  // and timer must not carry over to it.
  React.useEffect(() => {
    if (!src) {
      setSettled(true);
      setPastThreshold(false);
      return;
    }

    // Already decoded -- a warm image or a `data:` URL can finish before React
    // attaches onLoad, in which case that event never arrives for this render
    // and a spinner would hang forever.
    if (imgRef.current?.complete) {
      setSettled(true);
      setPastThreshold(false);
      return;
    }

    setSettled(false);
    setPastThreshold(false);
    const timer = setTimeout(() => setPastThreshold(true), IMAGE_LOADING_INDICATOR_DELAY_MS);
    // Covers the fast load, the source change and the unmount alike.
    return () => clearTimeout(timer);
  }, [src]);

  // An error settles it too. The surface's own error handling is authoritative
  // for what to SHOW; this only has to stop claiming the image is coming.
  const markSettled = React.useCallback(() => {
    setSettled(true);
    setPastThreshold(false);
  }, []);

  return {
    showIndicator: !settled && pastThreshold,
    imgProps: { ref: imgRef, onLoad: markSettled, onError: markSettled },
    markSettled,
  };
}

/**
 * The indicator itself. Mounted only while visible, so a screen reader
 * announces the wait once rather than on every fast image.
 *
 * Absolutely positioned: it needs a positioned ancestor, which every call site
 * already has.
 */
export function ImageLoadingOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div
      className="absolute inset-0 flex items-center justify-center bg-gray-50/60 pointer-events-none"
      role="status"
      aria-live="polite"
      data-testid="image-loading-indicator"
    >
      <Loader2 className="h-5 w-5 animate-spin text-gray-400" aria-hidden="true" />
      <span className="sr-only">Loading image…</span>
    </div>
  );
}

// `src` is narrowed to a string: this component keys its loading state on it,
// and ImgHTMLAttributes also admits Blob, which is not a source we can track.
type ImageWithLoadingIndicatorProps =
  Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src?: string };

/**
 * An <img> that reveals a delayed indicator while it loads.
 *
 * A component rather than a bare hook because the board card renders its image
 * inside a `.map()`, where a hook cannot go. The <img> it renders is the same
 * single element as before -- no wrapper, no second request.
 */
export function ImageWithLoadingIndicator({ src, ...rest }: ImageWithLoadingIndicatorProps) {
  const { showIndicator, imgProps } = useDelayedImageLoading(src);
  return (
    <>
      <img {...rest} src={src} {...imgProps} />
      <ImageLoadingOverlay visible={showIndicator} />
    </>
  );
}
