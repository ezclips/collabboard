import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FrameSlide, RenderSlideToPNG } from "./PresentationPanel";

export function useSlideThumbnails({
  slides,
  renderSlideToPNG,
  width,
  height,
  background = "#ffffff",
  dpr = 2,
}: {
  slides: FrameSlide[];
  renderSlideToPNG: RenderSlideToPNG;
  width: number;
  height: number;
  background?: string;
  dpr?: number;
}) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [isGeneratingAny, setIsGeneratingAny] = useState(false);

  // Track which slides have been rendered: id -> "x,y,w,h" version key
  const renderedRef = useRef<Record<string, string>>({});
  const inFlight = useRef<Set<string>>(new Set());
  const cancelledRef = useRef(false);

  // Keep latest slides in a ref so warmThumbs doesn't need them in its deps
  const slidesRef = useRef(slides);
  useEffect(() => { slidesRef.current = slides; }, [slides]);

  // warmThumbs is stable -only recreates when render config changes, not on every canvas update
  const warmThumbs = useCallback(async () => {
    const current = slidesRef.current;
    if (current.length === 0) return;

    // Only render slides whose geometry has changed or that have never been rendered
    const toRender = current.filter((s) => {
      const key = `${s.x},${s.y},${s.width},${s.height}`;
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
        const versionKey = `${s.x},${s.y},${s.width},${s.height}`;
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
  }, [renderSlideToPNG, width, height, background, dpr]); // slides intentionally excluded -use slidesRef

  // Signature changes only when slide geometry actually changes, not on every canvas paint
  const slideSignature = useMemo(
    () => slides.map((s) => `${s.id}:${s.x},${s.y},${s.width},${s.height}`).join("|"),
    [slides]
  );

  // Re-run warmThumbs only when actual geometry changes
  useEffect(() => {
    warmThumbs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
