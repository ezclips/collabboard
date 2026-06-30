import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FrameSlide, RenderSlideToPNG } from "./PresentationPanel";

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

  // Track which slides have been rendered: id -> cache key including contentVersion
  const renderedRef = useRef<Record<string, string>>({});
  const inFlight = useRef<Set<string>>(new Set());
  const cancelledRef = useRef(false);
  // Guards against capturing transient canvas state immediately on mount
  const isMountSettledRef = useRef(false);
  const getSlideCacheKey = useCallback(
    (slide: FrameSlide) => slide.renderSignature ?? `${slide.x},${slide.y},${slide.width},${slide.height},${slide.contentVersion ?? 0}`,
    [],
  );
  const warmThumbsRef = useRef<() => Promise<void>>(async () => {});

  // Keep latest slides in a ref so warmThumbs doesn't need them in its deps
  const slidesRef = useRef(slides);
  useEffect(() => { slidesRef.current = slides; }, [slides]);

  // warmThumbs is stable -only recreates when render config changes, not on every canvas update
  const warmThumbs = useCallback(async () => {
    const current = slidesRef.current;
    if (current.length === 0) return;

    // Only render slides whose geometry or content has changed, or that have never been rendered
    const toRender = current.filter((s) => {
      const key = getSlideCacheKey(s);
      return renderedRef.current[s.id] !== key && !inFlight.current.has(s.id);
    });

    if (toRender.length === 0) return;

    cancelledRef.current = false;
    setIsGeneratingAny(true);
    try {
      for (const s of toRender) {
        if (cancelledRef.current) break;
        if (inFlight.current.has(s.id)) continue;

        inFlight.current.add(s.id);
        const versionKey = getSlideCacheKey(s);
        try {
          const scale = s.height > 0 ? height / s.height : 1;
          const png = await renderSlideToPNG(s, {
            scale: scale * (dpr ?? 2),
            background,
            paddingPx: 20,
          });
          if (!cancelledRef.current) {
            renderedRef.current[s.id] = versionKey;
            setThumbs((prev) => {
              if (prev[s.id] === png) return prev;
              return { ...prev, [s.id]: png };
            });
          }
        } finally {
          inFlight.current.delete(s.id);
        }
      }
    } finally {
      setIsGeneratingAny(false);
    }
  }, [renderSlideToPNG, height, background, dpr, getSlideCacheKey]); // slides intentionally excluded -use slidesRef

  useEffect(() => {
    warmThumbsRef.current = warmThumbs;
  }, [warmThumbs]);

  // On mount, wait for canvas to settle (double-RAF) before the first thumbnail pass.
  // This prevents capturing transient "just opened" state.
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
      isMountSettledRef.current = false;
    };
  }, []); // intentionally runs once on mount only

  // Signature changes when slide geometry OR content version changes
  const slideSignature = useMemo(
    () => slides.map((s) => `${s.id}:${getSlideCacheKey(s)}`).join("|"),
    [slides, getSlideCacheKey]
  );

  // Re-run warmThumbs when geometry or content changes — but only after initial mount has settled
  useEffect(() => {
    if (!isMountSettledRef.current) return;
    warmThumbs();
  }, [warmThumbs, slideSignature]);

  // Return cleaned map with only current slide ids
  const slideIds = useMemo(() => slides.map((s) => s.id), [slides]);
  const cleaned = useMemo(() => {
    const idSet = new Set(slideIds);
    const next: Record<string, string> = {};
    for (const [id, png] of Object.entries(thumbs)) {
      if (idSet.has(id)) next[id] = png;
    }
    return next;
  }, [thumbs, slideIds]);

  return { thumbs: cleaned, warmThumbs, isGeneratingAny };
}
