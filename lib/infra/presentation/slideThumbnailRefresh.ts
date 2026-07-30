export type SlideThumbnailRefreshSlide = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  contentVersion?: number;
  renderSignature?: string;
};

export type SlideThumbnailRefreshRequest = {
  id: string;
  cacheKey: string;
  forced: boolean;
};

export const SLIDE_THUMBNAIL_REFRESH_DEBOUNCE_MS = 250;

export function getSlideThumbnailCacheKey(slide: SlideThumbnailRefreshSlide): string {
  return slide.renderSignature ?? `${slide.x},${slide.y},${slide.width},${slide.height},${slide.contentVersion ?? 0}`;
}

export function selectSlidesForThumbnailRefresh({
  slides,
  renderedKeys,
  inFlightIds,
  forcedIds,
}: {
  slides: readonly SlideThumbnailRefreshSlide[];
  renderedKeys: Readonly<Record<string, string>>;
  inFlightIds: ReadonlySet<string>;
  forcedIds?: ReadonlySet<string> | null;
}): {
  requests: SlideThumbnailRefreshRequest[];
  deferredIds: string[];
} {
  const requests: SlideThumbnailRefreshRequest[] = [];
  const deferredIds: string[] = [];
  const forceAll = forcedIds === null;

  for (const slide of slides) {
    const cacheKey = getSlideThumbnailCacheKey(slide);
    const forced = forceAll || Boolean(forcedIds?.has(slide.id));
    if (!forced && renderedKeys[slide.id] === cacheKey) continue;

    if (inFlightIds.has(slide.id)) {
      deferredIds.push(slide.id);
      continue;
    }

    requests.push({ id: slide.id, cacheKey, forced });
  }

  return { requests, deferredIds };
}

export function selectQueuedSlidesForActiveThumbnailPass({
  slides,
  renderedKeys,
  inFlightIds,
  forcedIds,
}: {
  slides: readonly SlideThumbnailRefreshSlide[];
  renderedKeys: Readonly<Record<string, string>>;
  inFlightIds: ReadonlySet<string>;
  forcedIds?: ReadonlySet<string> | null;
}): {
  forceAll: boolean;
  forcedSlideIds: string[];
  changedSlideIds: string[];
} {
  if (forcedIds === null) {
    return { forceAll: true, forcedSlideIds: [], changedSlideIds: [] };
  }

  if (forcedIds) {
    const currentIds = new Set(slides.map((slide) => slide.id));
    return {
      forceAll: false,
      forcedSlideIds: [...new Set([...forcedIds].filter((id) => currentIds.has(id)))],
      changedSlideIds: [],
    };
  }

  const { requests, deferredIds } = selectSlidesForThumbnailRefresh({
    slides,
    renderedKeys,
    inFlightIds,
  });

  return {
    forceAll: false,
    forcedSlideIds: [],
    changedSlideIds: [...new Set([...requests.map((request) => request.id), ...deferredIds])],
  };
}

export function shouldAcceptSlideThumbnailRender({
  requestId,
  latestRequestId,
  requestedCacheKey,
  latestCacheKey,
}: {
  requestId: number;
  latestRequestId: number | undefined;
  requestedCacheKey: string;
  latestCacheKey: string | undefined;
}): boolean {
  return requestId === latestRequestId && requestedCacheKey === latestCacheKey;
}
