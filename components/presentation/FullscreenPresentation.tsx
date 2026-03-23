"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FrameSlide, RenderSlideToPNG } from "./PresentationPanel";
import type { Padlet } from "@/types/collabboard";
import PostCardContent from "@/components/collabboard/PostCardContent";

/**
 * Given the image's intrinsic aspect ratio and the viewport size,
 * compute the rectangle where `object-fit: contain` actually renders
 * the image (i.e. the non-letterboxed area).
 */
function getContainedRect(
  frameW: number,
  frameH: number,
  vpW: number,
  vpH: number,
): { x: number; y: number; w: number; h: number } {
  if (frameW <= 0 || frameH <= 0 || vpW <= 0 || vpH <= 0) {
    return { x: 0, y: 0, w: vpW, h: vpH };
  }
  const frameAspect = frameW / frameH;
  const vpAspect = vpW / vpH;
  let w: number, h: number;
  if (frameAspect > vpAspect) {
    // Width-constrained (letterboxed top/bottom)
    w = vpW;
    h = vpW / frameAspect;
  } else {
    // Height-constrained (pillarboxed left/right)
    h = vpH;
    w = vpH * frameAspect;
  }
  return {
    x: (vpW - w) / 2,
    y: (vpH - h) / 2,
    w,
    h,
  };
}

export function FullscreenPresentation({
  slides,
  startSlideId,
  renderSlideToPNG,
  onClose,
  contentPadlets = [],
}: {
  slides: FrameSlide[];
  startSlideId: string | null;
  renderSlideToPNG: RenderSlideToPNG;
  onClose: () => void;
  contentPadlets?: Padlet[];
}) {
  const [currentIdx, setCurrentIdx] = useState(() => {
    if (!startSlideId) return 0;
    const idx = slides.findIndex((s) => s.id === startSlideId);
    return idx >= 0 ? idx : 0;
  });

  // PNG cache: slideId → dataURL
  const [pngs, setPngs] = useState<Record<string, string>>({});
  const renderingRef = useRef<Set<string>>(new Set());
  const cancelledRef = useRef(false);

  // Track viewport size for overlay positioning
  const [vpSize, setVpSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const measure = () => setVpSize({ w: window.innerWidth, h: window.innerHeight });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const currentSlide = slides[currentIdx];

  // Rectangle where the slide image actually renders (matching object-fit:contain)
  const overlayRect = useMemo(() => {
    if (!currentSlide || vpSize.w === 0) return null;
    return getContainedRect(currentSlide.width, currentSlide.height, vpSize.w, vpSize.h);
  }, [currentSlide, vpSize]);

  // Content padlets that overlap the current slide's frame bounds
  const slidePadlets = useMemo(() => {
    if (!currentSlide || !contentPadlets.length) return [];
    return contentPadlets.filter((p) => {
      return (
        p.position_x < currentSlide.x + currentSlide.width &&
        p.position_x + p.width > currentSlide.x &&
        p.position_y < currentSlide.y + currentSlide.height &&
        p.position_y + p.height > currentSlide.y
      );
    });
  }, [currentSlide, contentPadlets]);

  const renderSlide = useCallback(async (slide: FrameSlide | undefined) => {
    if (!slide) return;
    if (pngs[slide.id] || renderingRef.current.has(slide.id)) return;
    renderingRef.current.add(slide.id);

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const screenH = typeof window !== "undefined" ? window.innerHeight : 1080;
    const rawScale = slide.height > 0 ? Math.max(1080, screenH) / slide.height : 1;
    const scale = rawScale * Math.min(dpr, 2);

    const png = await renderSlideToPNG(slide, {
      scale,
      background: "#ffffff",
      paddingPx: 0,
    });
    if (!cancelledRef.current) {
      setPngs((prev) => ({ ...prev, [slide.id]: png }));
    }
    renderingRef.current.delete(slide.id);
  }, [pngs, renderSlideToPNG]);

  // Render current + pre-fetch adjacent
  useEffect(() => {
    renderSlide(slides[currentIdx]);
    renderSlide(slides[currentIdx + 1]);
    renderSlide(slides[currentIdx - 1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, slides]);

  useEffect(() => {
    cancelledRef.current = false;
    return () => { cancelledRef.current = true; };
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        setCurrentIdx((i) => Math.min(slides.length - 1, i + 1));
      }
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        setCurrentIdx((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length, onClose]);

  const currentPng = currentSlide ? pngs[currentSlide.id] : null;

  // DEBUG: log actual dimensions to browser console
  useEffect(() => {
    if (currentSlide && overlayRect) {
      console.debug(
        "[Presentation] viewport:", vpSize,
        "| frame:", { w: currentSlide.width, h: currentSlide.height },
        "| overlayRect:", overlayRect,
      );
    }
  }, [currentSlide, vpSize, overlayRect]);

  const content = (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 9999,
        backgroundColor: "#ffffff",
        overflow: "hidden",
        userSelect: "none",
      }}
    >
      {currentPng ? (
        <>
          {/*
            The slide image fills the entire viewport.
            object-fit: contain makes the BROWSER handle aspect-ratio fitting —
            no JS / CSS-layout math needed for the image itself.
          */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentPng}
            alt={`Slide ${currentIdx + 1}`}
            draggable={false}
            style={{
              display: "block",
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
            }}
          />

          {/*
            Padlet overlay container — positioned EXACTLY over the area where
            object-fit:contain renders the image (calculated by getContainedRect).
            Padlets use percentage positioning within this container.
          */}
          {overlayRect && currentSlide && (
            <div
              style={{
                position: "absolute",
                left: overlayRect.x,
                top: overlayRect.y,
                width: overlayRect.w,
                height: overlayRect.h,
                overflow: "hidden",
                pointerEvents: "none",
              }}
            >
              {slidePadlets.map((padlet) => {
                const pctLeft = ((padlet.position_x - currentSlide.x) / currentSlide.width) * 100;
                const pctTop = ((padlet.position_y - currentSlide.y) / currentSlide.height) * 100;
                const pctW = (padlet.width / currentSlide.width) * 100;
                const pctH = (padlet.height / currentSlide.height) * 100;
                return (
                  <div
                    key={padlet.id}
                    className="absolute overflow-hidden rounded-xl border border-gray-200/50 shadow-md"
                    style={{
                      left: `${pctLeft}%`,
                      top: `${pctTop}%`,
                      width: `${pctW}%`,
                      height: `${pctH}%`,
                      backgroundColor: padlet.metadata?.backgroundColor || "#ffffff",
                    }}
                  >
                    {padlet.metadata?.topStrip && (
                      <div
                        className="h-1.5 w-full flex-shrink-0"
                        style={{ backgroundColor: padlet.metadata.topStrip }}
                      />
                    )}
                    <div className="w-full h-full overflow-hidden">
                      <PostCardContent padlet={padlet} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div className="flex flex-col items-center justify-center gap-3 text-gray-400 text-sm">
            <svg className="animate-spin w-8 h-8" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            Rendering slide…
          </div>
        </div>
      )}

      {/* Floating nav bar */}
      <div
        className="flex items-center gap-3 bg-black/70 backdrop-blur-sm rounded-2xl px-5 py-3"
        style={{
          position: "absolute",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          pointerEvents: "auto",
        }}
      >
        <button
          type="button"
          onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
          disabled={currentIdx <= 0}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Previous (←)"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        <span className="text-white text-sm font-medium min-w-[80px] text-center tabular-nums">
          Slide {currentIdx + 1} / {slides.length}
        </span>

        <button
          type="button"
          onClick={() => setCurrentIdx((i) => Math.min(slides.length - 1, i + 1))}
          disabled={currentIdx >= slides.length - 1}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Next (→)"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>

        <div className="w-px h-6 bg-white/20 mx-1" />

        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-2 px-3 py-1.5 bg-red-500/80 hover:bg-red-500 text-white text-sm font-medium rounded-xl transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 9l6 6M15 9l-6 6" />
          </svg>
          End presentation
        </button>
      </div>

      {/* Hint */}
      <div
        className="text-gray-400 text-xs"
        style={{ position: "absolute", top: 16, right: 16 }}
      >
        ← → Space · Esc to end
      </div>
    </div>
  );

  if (typeof document === "undefined") return content;
  return createPortal(content, document.body);
}
