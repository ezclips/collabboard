// @vitest-environment jsdom
//
// R6H -- the delayed loading indicator for images that take a moment.
//
// The behaviour worth testing is the timing, not the markup: a spinner that
// appears for every image would be worse than none, and one that never clears
// would be worse still. So the fast path, the slow path, the error path and the
// teardown paths are all driven with fake timers.

import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import {
  IMAGE_LOADING_INDICATOR_DELAY_MS,
  ImageWithLoadingIndicator,
} from './useDelayedImageLoading';

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const hookSource = read('components/collabboard/editors/useDelayedImageLoading.tsx');
/** The hook's executable code, with its prose stripped: the doc comment names
 *  the very things the contract below forbids. */
const hookCode = hookSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
const freeform = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
const drawingLayer = read('components/collabboard/editors/ImageDrawingLayer.tsx');
const cropLayer = read('components/collabboard/editors/ImageCropLayer.tsx');

const PRIVATE_ROUTE = '/api/boards/b1/padlets/p1/image';

/** jsdom never loads images, so `complete` is ours to drive. */
function stubComplete(value: boolean) {
  Object.defineProperty(HTMLImageElement.prototype, 'complete', {
    configurable: true,
    get: () => value,
  });
}

const indicator = () => screen.queryByTestId('image-loading-indicator');

beforeEach(() => {
  vi.useFakeTimers();
  stubComplete(false);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function renderImage(src: string | undefined) {
  return render(<ImageWithLoadingIndicator src={src} alt="test" />);
}

const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

describe('R6H-1..5: the indicator only appears when the wait is real', () => {
  it('R6H-1: a private image starts out tracked as loading, but shows nothing yet', () => {
    renderImage(PRIVATE_ROUTE);
    // Nothing at all before the threshold -- this is the anti-flash rule.
    expect(indicator()).toBeNull();
    advance(IMAGE_LOADING_INDICATOR_DELAY_MS - 1);
    expect(indicator()).toBeNull();
  });

  it('R6H-2: an image that completes before the threshold never shows a spinner', () => {
    // The ordinary case: public images and R6D's flattened data: composite.
    renderImage(PRIVATE_ROUTE);
    advance(IMAGE_LOADING_INDICATOR_DELAY_MS - 50);
    act(() => { screen.getByAltText('test').dispatchEvent(new Event('load')); });

    advance(1000);
    expect(indicator()).toBeNull();
  });

  it('R6H-3: an image still in flight after the threshold gets one', () => {
    renderImage(PRIVATE_ROUTE);
    advance(IMAGE_LOADING_INDICATOR_DELAY_MS);
    expect(indicator()).not.toBeNull();
  });

  it('R6H-4: and it disappears the moment the image lands', () => {
    renderImage(PRIVATE_ROUTE);
    advance(IMAGE_LOADING_INDICATOR_DELAY_MS);
    expect(indicator()).not.toBeNull();

    act(() => { screen.getByAltText('test').dispatchEvent(new Event('load')); });
    expect(indicator()).toBeNull();
  });

  it('R6H-5: an error clears it too -- never an endless spinner', () => {
    // The surface's own error handling stays authoritative for what to SHOW;
    // this only has to stop claiming the image is still coming.
    renderImage(PRIVATE_ROUTE);
    advance(IMAGE_LOADING_INDICATOR_DELAY_MS);
    expect(indicator()).not.toBeNull();

    act(() => { screen.getByAltText('test').dispatchEvent(new Event('error')); });
    expect(indicator()).toBeNull();
  });

  it('an already-decoded image never spins, even though onLoad cannot fire again', () => {
    // A warm image or a `data:` URL can finish before React attaches onLoad. If
    // the hook waited for that event it would spin forever.
    stubComplete(true);
    renderImage('data:image/png;base64,AAA');
    advance(5000);
    expect(indicator()).toBeNull();
  });

  it('no src means nothing to wait for', () => {
    renderImage(undefined);
    advance(5000);
    expect(indicator()).toBeNull();
  });
});

describe('R6H-6,7: timers are reset and cleaned up', () => {
  it('R6H-6: changing the source restarts the wait rather than inheriting it', () => {
    const { rerender } = renderImage(PRIVATE_ROUTE);
    advance(IMAGE_LOADING_INDICATOR_DELAY_MS);
    expect(indicator()).not.toBeNull();

    // A new source is a new load: the previous image's indicator must not
    // simply carry over as if it described this one.
    rerender(<ImageWithLoadingIndicator src="/api/boards/b1/padlets/p2/image" alt="test" />);
    expect(indicator()).toBeNull();

    advance(IMAGE_LOADING_INDICATOR_DELAY_MS);
    expect(indicator()).not.toBeNull();
  });

  it('R6H-6b: a source that settles, then changes, starts clean again', () => {
    const { rerender } = renderImage(PRIVATE_ROUTE);
    act(() => { screen.getByAltText('test').dispatchEvent(new Event('load')); });
    expect(indicator()).toBeNull();

    rerender(<ImageWithLoadingIndicator src="/api/boards/b1/padlets/p2/image" alt="test" />);
    advance(IMAGE_LOADING_INDICATOR_DELAY_MS);
    expect(indicator()).not.toBeNull();
  });

  it('R6H-7: unmounting before the threshold leaves no timer behind', () => {
    const { unmount } = renderImage(PRIVATE_ROUTE);
    unmount();
    // A surviving timer would setState on an unmounted component here.
    expect(() => advance(5000)).not.toThrow();
    expect(indicator()).toBeNull();
  });

  it('the delay is short enough to be a flash guard, not a stall', () => {
    expect(IMAGE_LOADING_INDICATOR_DELAY_MS).toBeGreaterThanOrEqual(200);
    expect(IMAGE_LOADING_INDICATOR_DELAY_MS).toBeLessThanOrEqual(300);
  });
});

describe('R6H-8..11: it costs nothing, and follows the resolved source', () => {
  it('R6H-8: no second request is created to observe loading', () => {
    // Constructing `new Image()`, or adding a cache-buster, would hand back
    // R6D's saving -- the private route answers `private, no-store`, so any
    // extra request is a genuine extra round trip.
    for (const forbidden of ['new Image(', 'fetch(', 'XMLHttpRequest', 'preload', 'cache-bust', '?t=', 'Date.now()']) {
      expect(hookCode, forbidden).not.toContain(forbidden);
    }
    // It rides the element's own events instead.
    expect(hookSource).toContain('onLoad: markSettled');
    expect(hookSource).toContain('onError: markSettled');
    expect(hookSource).toContain('imgRef.current?.complete');
  });

  it('R6H-9: the main image is not remounted -- R6D keeps its mounted-image saving', () => {
    // The component renders the SAME single <img>, with no wrapper element that
    // would change the tree around it.
    expect(hookSource).toContain('<img {...rest} src={src} {...imgProps} />');
    // R6D's mounted-image guarantee lives on the overlay in FreeformPadletCards.
    expect(freeform).toContain('R6D. The main overlay stays MOUNTED behind a subtool.');
  });

  it('R6H-10,11: the indicator follows the RESOLVED display src, not raw metadata', () => {
    // R6D can prefer a flattened data: composite over the private route. Keying
    // on the route would spin over an image that is already on screen.
    expect(freeform).toContain('src={resolveImagePostDisplaySrc(padlet) ?? undefined}');
    // R6I-C1 moved the card into ImagePostEditorCard; the overlay hands it the
    // resolved source under the component's own prop name.
    expect(freeform).toContain('imageSrc={activeImageToolbarSrc ?? undefined}');
    const cardTag = freeform.slice(freeform.indexOf('<ImageWithLoadingIndicator'));
    expect(cardTag.slice(0, 600)).toContain('resolveImagePostDisplaySrc');
  });

  it('every image surface the user waits on is covered', () => {
    // Card, modal preview, Draw, and Edit image.
    // The board card still renders it directly; the modal preview now goes
    // through the shared Image post card, which renders the same component.
    expect((freeform.match(/<ImageWithLoadingIndicator/g) ?? [])).toHaveLength(1);
    const card = read('components/collabboard/editors/ImagePostEditorCard.tsx');
    expect(card).toContain('<ImageWithLoadingIndicator');
    expect(freeform).toContain('<ImagePostEditorCard');
    // R6H-C1 gave the Draw layer a two-phase base of its own, so it composes
    // with the hook directly rather than using the wrapper component.
    expect(drawingLayer).toContain('useDelayedImageLoading(imageUrl)');
    expect(drawingLayer).toContain('<ImageLoadingOverlay visible={showBaseLoadingIndicator} />');
    expect(cropLayer).toContain('<ImageLoadingOverlay visible={showImageLoading} />');
  });

  it('the crop layer reuses its OWN load/error events rather than adding handlers', () => {
    // ReactCrop owns its <img> child, so the element is composed with rather
    // than swapped out.
    expect(cropLayer).toContain('markImageSettled(); onImageLoad(e);');
    expect(cropLayer).toContain('markImageSettled(); setLoadError(true);');
    expect(cropLayer).toContain('useDelayedImageLoading(imageUrl)');
  });
});

describe('R6H-10: private image serving is untouched', () => {
  it('no public URL, signed URL, storage path or persistent cache is introduced', () => {
    for (const forbidden of [
      'getPublicUrl', 'createSignedUrl', 'padlet-files', 'storage/v1',
      'localStorage', 'sessionStorage', 'indexedDB', 'Cache-Control',
    ]) {
      expect(hookCode, forbidden).not.toContain(forbidden);
    }
  });

  it('R6H-12: an ordinary public image behaves the same way', () => {
    renderImage('https://cdn.test/photo.png');
    advance(IMAGE_LOADING_INDICATOR_DELAY_MS);
    expect(indicator()).not.toBeNull();
    act(() => { screen.getByAltText('test').dispatchEvent(new Event('load')); });
    expect(indicator()).toBeNull();
  });

  it('the indicator is announced once, only when it actually becomes visible', () => {
    renderImage(PRIVATE_ROUTE);
    advance(IMAGE_LOADING_INDICATOR_DELAY_MS);
    const el = indicator()!;
    expect(el.getAttribute('role')).toBe('status');
    expect(el.getAttribute('aria-live')).toBe('polite');
    expect(el.textContent).toContain('Loading image');
    // It must never intercept a click meant for the canvas beneath it.
    expect(el.className).toContain('pointer-events-none');
  });
});
