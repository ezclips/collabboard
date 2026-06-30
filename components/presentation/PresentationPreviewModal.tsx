"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { FrameSlide, RenderSlideToPNG } from "./PresentationPanel";
import { SlideThumbnail } from "./SlideThumbnail";

export function PresentationPreviewModal({
  open,
  onClose,
  slides,
  activeSlideId,
  renderSlideToPNG,
}: {
  open: boolean;
  onClose: () => void;
  slides: FrameSlide[];
  activeSlideId: string | null;
  renderSlideToPNG: RenderSlideToPNG;
}) {
  const [currentId, setCurrentId] = useState<string | null>(activeSlideId);

  useEffect(() => {
    if (!open) return;
    setCurrentId(activeSlideId ?? slides[0]?.id ?? null);
  }, [open, activeSlideId, slides]);

  const currentIndex = useMemo(() => {
    if (!currentId) return 0;
    const idx = slides.findIndex((s) => s.id === currentId);
    return idx >= 0 ? idx : 0;
  }, [currentId, slides]);

  const currentSlide = slides[currentIndex];

  const [bigPng, setBigPng] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const renderedThumbKeysRef = useRef<Record<string, string>>({});
  // Tracks whether this is the very first open — needs settle delay before capture
  const isFirstOpenRef = useRef(true);
  useEffect(() => { if (!open) { isFirstOpenRef.current = true; } }, [open]);
  const getSlideCacheKey = React.useCallback(
    (slide: FrameSlide) => slide.renderSignature ?? `${slide.x},${slide.y},${slide.width},${slide.height},${slide.contentVersion ?? 0}`,
    [],
  );

  // Render the big preview when current slide changes.
  // On initial open, wait double-RAF so canvas state has settled before capture.
  useEffect(() => {
    if (!open || !currentSlide) return;
    setBigPng(null);

    let cancelled = false;
    let raf2: number;
    const render = () => {
      const scale = currentSlide.height > 0 ? 900 / currentSlide.height : 1;
      renderSlideToPNG(currentSlide, {
        scale: scale * 2,
        background: "#ffffff",
        paddingPx: 32,
      }).then((png) => {
        if (!cancelled) setBigPng(png);
      });
    };

    if (isFirstOpenRef.current) {
      isFirstOpenRef.current = false;
      const raf1 = window.requestAnimationFrame(() => {
        raf2 = window.requestAnimationFrame(render);
      });
      return () => {
        cancelled = true;
        window.cancelAnimationFrame(raf1);
        window.cancelAnimationFrame(raf2);
      };
    }

    render();
    return () => { cancelled = true; };
  }, [open, currentSlide, renderSlideToPNG, getSlideCacheKey]);

  useEffect(() => {
    if (!open) return;

    setThumbs((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const slide of slides) {
        const cacheKey = getSlideCacheKey(slide);
        if (renderedThumbKeysRef.current[slide.id] && renderedThumbKeysRef.current[slide.id] !== cacheKey) {
          delete next[slide.id];
          delete renderedThumbKeysRef.current[slide.id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [open, slides, getSlideCacheKey]);

  // Warm thumbnails for the strip.
  // Double-RAF at start prevents capturing transient state on first open.
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const run = async () => {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
      });
      if (cancelled) return;
      for (const s of slides.slice(0, 24)) {
        if (cancelled) break;
        const cacheKey = getSlideCacheKey(s);
        if (renderedThumbKeysRef.current[s.id] === cacheKey) continue;
        const scale = s.height > 0 ? 160 / s.height : 1;
        const png = await renderSlideToPNG(s, {
          scale: scale * 2,
          background: "#ffffff",
          paddingPx: 20,
        });
        if (!cancelled) {
          renderedThumbKeysRef.current[s.id] = cacheKey;
          setThumbs((prev) => ({ ...prev, [s.id]: png }));
        }
      }
    };
    run();

    return () => { cancelled = true; };
  }, [open, slides, renderSlideToPNG, getSlideCacheKey]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        setCurrentId(slides[Math.min(slides.length - 1, currentIndex + 1)]?.id ?? null);
      }
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        setCurrentId(slides[Math.max(0, currentIndex - 1)]?.id ?? null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, currentIndex, slides, onClose]);

  if (!open) return null;

  const title = currentSlide?.name?.trim()
    ? currentSlide.name!.trim()
    : currentSlide
      ? `Slide ${currentIndex + 1}`
      : "Slide";

  return (
    <div className="fixed inset-0 z-[800]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="absolute inset-4 md:inset-8 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden flex">
        {/* Left thumbnail strip */}
        <div className="w-[260px] border-r border-gray-200 bg-gray-50 overflow-auto flex-shrink-0">
          <div className="px-4 py-3 flex items-center justify-between border-b border-gray-200">
            <div className="text-sm font-semibold text-gray-900">Slides</div>
            <button
              type="button"
              onClick={onClose}
              className="text-xs px-2 py-1 rounded-md bg-white border border-gray-200 hover:bg-gray-100"
            >
              Close
            </button>
          </div>

          <div className="p-3 space-y-3">
            {slides.map((s, idx) => {
              const isActive = s.id === currentId;
              const t = s.name?.trim() ? s.name!.trim() : `Slide ${idx + 1}`;
              const png = thumbs[s.id] ?? null;

              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setCurrentId(s.id)}
                  className={[
                    "w-full text-left rounded-xl border overflow-hidden bg-white",
                    isActive
                      ? "border-violet-400 ring-2 ring-violet-100"
                      : "border-gray-200 hover:border-gray-300",
                  ].join(" ")}
                >
                  <div className="p-2">
                    <SlideThumbnail pngDataUrl={png} width={240} height={160} isActive={isActive} />
                  </div>
                  <div className="px-3 py-2 border-t border-gray-100 bg-gray-50">
                    <div className="text-xs font-medium text-gray-700 truncate">{t}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Main preview area */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
            <div className="min-w-0">
              <div className="text-base font-semibold text-gray-900 truncate">{title}</div>
              <div className="text-xs text-gray-500 mt-0.5">
                {currentIndex + 1} / {slides.length}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setCurrentId(slides[Math.max(0, currentIndex - 1)]?.id ?? null)
                }
                className="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-50 text-sm"
                disabled={currentIndex <= 0}
              >
                ← Prev
              </button>
              <button
                type="button"
                onClick={() =>
                  setCurrentId(slides[Math.min(slides.length - 1, currentIndex + 1)]?.id ?? null)
                }
                className="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-50 text-sm"
                disabled={currentIndex >= slides.length - 1}
              >
                Next →
              </button>
            </div>
          </div>

          <div className="flex-1 bg-gray-100 p-4 md:p-8 overflow-auto flex items-center justify-center">
            <div className="w-full max-w-[1100px]">
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="aspect-[16/10] w-full relative bg-white">
                  {bigPng ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={bigPng}
                      alt="Slide"
                      className="absolute inset-0 w-full h-full object-contain"
                      draggable={false}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
                      Rendering slide…
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 text-xs text-gray-500 text-center">
                ← → Space PageUp/PageDown to navigate · Esc to close
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
