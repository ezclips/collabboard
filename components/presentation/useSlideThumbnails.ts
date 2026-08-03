import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FrameSlide, RenderSlideToPNG } from "./PresentationPanel";
import {
  getSlideThumbnailCacheKey,
  selectQueuedSlidesForActiveThumbnailPass,
  selectSlidesForThumbnailRefresh,
  shouldAcceptSlideThumbnailRender,
  SLIDE_THUMBNAIL_REFRESH_DEBOUNCE_MS,
} from "@/lib/infra/presentation/slideThumbnailRefresh";

export function useSlideThumbnails({
  slides,
  renderSlideToPNG,
  height,
  background = "#ffffff",
  dpr = 2,
}: {
  slides: FrameSlide[];
  renderSlideToPNG: RenderSlideToPNG;
  height: number;
  background?: string;
  dpr?: number;
}) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [isGeneratingAny, setIsGeneratingAny] = useState(false);

  const renderedRef = useRef<Record<string, string>>({});
  const inFlightRef = useRef<Set<string>>(new Set());
  const latestRequestIdRef = useRef<Record<string, number>>({});
  const requestIdRef = useRef(0);
  const abortControllersRef = useRef<Record<string, AbortController>>({});
  const pendingSlideIdsRef = useRef<Set<string>>(new Set());
  const pendingChangedSlideIdsRef = useRef<Set<string>>(new Set());
  const pendingForceAllRef = useRef(false);
  const refreshTimerRef = useRef<number | null>(null);
  const runningRefreshRef = useRef(false);
  const cancelledRef = useRef(false);
  const isMountSettledRef = useRef(false);
  const warmThumbsRef = useRef<() => Promise<void>>(async () => {});
  const scheduleRefreshRef = useRef<(ids?: readonly string[] | null, immediate?: boolean) => void>(() => {});

  const slidesRef = useRef(slides);
  useEffect(() => { slidesRef.current = slides; }, [slides]);

  const warmThumbs = useCallback(async (forcedIds?: ReadonlySet<string> | null) => {
    if (runningRefreshRef.current) {
      const queued = selectQueuedSlidesForActiveThumbnailPass({
        slides: slidesRef.current,
        renderedKeys: renderedRef.current,
        inFlightIds: inFlightRef.current,
        forcedIds,
      });

      if (queued.forceAll) {
        Object.values(abortControllersRef.current).forEach((controller) => controller.abort());
        pendingForceAllRef.current = true;
        pendingSlideIdsRef.current.clear();
        pendingChangedSlideIdsRef.current.clear();
      } else {
        for (const id of queued.forcedSlideIds) {
          abortControllersRef.current[id]?.abort();
          pendingSlideIdsRef.current.add(id);
        }
        for (const id of queued.changedSlideIds) {
          abortControllersRef.current[id]?.abort();
          pendingChangedSlideIdsRef.current.add(id);
        }
      }
      return;
    }

    runningRefreshRef.current = true;
    const current = slidesRef.current;
    if (current.length === 0) {
      runningRefreshRef.current = false;
      setIsGeneratingAny(false);
      return;
    }

    const { requests, deferredIds } = selectSlidesForThumbnailRefresh({
      slides: current,
      renderedKeys: renderedRef.current,
      inFlightIds: inFlightRef.current,
      forcedIds,
    });
    for (const id of deferredIds) pendingSlideIdsRef.current.add(id);

    if (requests.length === 0) {
      runningRefreshRef.current = false;
      setIsGeneratingAny(inFlightRef.current.size > 0);
      return;
    }

    cancelledRef.current = false;
    setIsGeneratingAny(true);
    try {
      for (const request of requests) {
        if (cancelledRef.current) break;
        const slide = slidesRef.current.find((entry) => entry.id === request.id);
        if (!slide || inFlightRef.current.has(slide.id)) continue;

        inFlightRef.current.add(slide.id);
        const cacheKey = getSlideThumbnailCacheKey(slide);
        const requestId = ++requestIdRef.current;
        abortControllersRef.current[slide.id]?.abort();
        const abortController = new AbortController();
        abortControllersRef.current[slide.id] = abortController;
        latestRequestIdRef.current[slide.id] = requestId;

        try {
          const scale = slide.height > 0 ? height / slide.height : 1;
          const png = await renderSlideToPNG(slide, {
            scale: scale * (dpr ?? 2),
            background,
            paddingPx: 20,
            signal: abortController.signal,
          } as Parameters<RenderSlideToPNG>[1] & { signal: AbortSignal });
          const latestSlide = slidesRef.current.find((entry) => entry.id === slide.id);
          const latestCacheKey = latestSlide ? getSlideThumbnailCacheKey(latestSlide) : undefined;
          const shouldAccept = !cancelledRef.current && shouldAcceptSlideThumbnailRender({
            requestId,
            latestRequestId: latestRequestIdRef.current[slide.id],
            requestedCacheKey: cacheKey,
            latestCacheKey,
          });

          if (shouldAccept) {
            renderedRef.current[slide.id] = cacheKey;
            setThumbs((prev) => {
              if (prev[slide.id] === png) return prev;
              return { ...prev, [slide.id]: png };
            });
          } else if (latestSlide) {
            pendingSlideIdsRef.current.add(slide.id);
          }
        } catch (error) {
          if (abortController.signal.aborted && !cancelledRef.current) {
            pendingSlideIdsRef.current.add(slide.id);
          } else {
            throw error;
          }
        } finally {
          if (abortControllersRef.current[slide.id] === abortController) {
            delete abortControllersRef.current[slide.id];
          }
          inFlightRef.current.delete(slide.id);
        }
      }
    } finally {
      runningRefreshRef.current = false;
      setIsGeneratingAny(inFlightRef.current.size > 0);
      if (
        !cancelledRef.current
        && (pendingForceAllRef.current || pendingSlideIdsRef.current.size > 0 || pendingChangedSlideIdsRef.current.size > 0)
      ) {
        scheduleRefreshRef.current(undefined, true);
      }
    }
  }, [renderSlideToPNG, height, background, dpr]);

  const scheduleRefresh = useCallback((ids?: readonly string[] | null, immediate = false) => {
    if (ids === null) {
      pendingForceAllRef.current = true;
      pendingSlideIdsRef.current.clear();
      pendingChangedSlideIdsRef.current.clear();
    } else if (ids) {
      for (const id of ids) pendingSlideIdsRef.current.add(id);
    }

    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    const run = () => {
      refreshTimerRef.current = null;
      const forcedIds = pendingForceAllRef.current
        ? null
        : pendingSlideIdsRef.current.size > 0
          ? new Set(pendingSlideIdsRef.current)
          : undefined;
      pendingForceAllRef.current = false;
      pendingSlideIdsRef.current.clear();
      pendingChangedSlideIdsRef.current.clear();
      void warmThumbs(forcedIds);
    };

    if (immediate) {
      run();
      return;
    }

    refreshTimerRef.current = window.setTimeout(run, SLIDE_THUMBNAIL_REFRESH_DEBOUNCE_MS);
  }, [warmThumbs]);

  useEffect(() => {
    warmThumbsRef.current = () => warmThumbs();
    scheduleRefreshRef.current = scheduleRefresh;
  }, [warmThumbs, scheduleRefresh]);

  useEffect(() => {
    let raf2: number;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        isMountSettledRef.current = true;
        void warmThumbsRef.current();
      });
    });
    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      isMountSettledRef.current = false;
      cancelledRef.current = true;
      Object.values(abortControllersRef.current).forEach((controller) => controller.abort());
      abortControllersRef.current = {};
    };
  }, []);

  const slideSignature = useMemo(
    () => slides.map((slide) => `${slide.id}:${getSlideThumbnailCacheKey(slide)}`).join("|"),
    [slides],
  );

  useEffect(() => {
    if (!isMountSettledRef.current) return;
    scheduleRefresh();
  }, [scheduleRefresh, slideSignature]);

  const refreshAllThumbnails = useCallback(() => {
    scheduleRefresh(null, true);
  }, [scheduleRefresh]);

  const slideIds = useMemo(() => slides.map((slide) => slide.id), [slides]);
  const cleaned = useMemo(() => {
    const idSet = new Set(slideIds);
    const next: Record<string, string> = {};
    for (const [id, png] of Object.entries(thumbs)) {
      if (idSet.has(id)) next[id] = png;
    }
    return next;
  }, [thumbs, slideIds]);

  return {
    thumbs: cleaned,
    refreshAllThumbnails,
    isGeneratingAny,
  };
}
