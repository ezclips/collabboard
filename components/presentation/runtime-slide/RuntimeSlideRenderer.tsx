"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Padlet } from "@/types/collabboard";
import type { FrameSlide } from "@/components/presentation/PresentationPanel";
import { planSlideComposition } from "@/components/presentation/slide-renderer/planSlideComposition";
import { renderExcalidrawSlideBase } from "@/components/presentation/slide-renderer/renderExcalidrawSlideBase";
import { RuntimePadletLayer } from "./RuntimePadletLayer";

type RuntimeSlideRendererProps = {
  slide: FrameSlide | undefined;
  sceneElements: readonly any[];
  allPadlets: Padlet[];
  files: any;
  vpW: number;
  vpH: number;
};

/**
 * Runtime slideshow renderer.
 *
 * Splits each slide into three layers:
 *   1. below-band  — Excalidraw native elements whose scene index < first padlet (PNG, with white bg)
 *   2. padlet layer — live DOM padlet cards with interactivity / scrolling
 *   3. above-band  — Excalidraw native elements whose scene index > last padlet (PNG, transparent bg)
 *
 * This composition is derived fresh from current scene state on every render,
 * ensuring Excalidraw background ordering is correct from the very first open.
 *
 * Excalidraw PNGs render asynchronously; padlet cards appear immediately.
 */
export function RuntimeSlideRenderer({
  slide,
  sceneElements,
  allPadlets,
  files,
  vpW,
  vpH,
}: RuntimeSlideRendererProps) {
  const [belowPng, setBelowPng] = useState<string | null>(null);
  const [abovePng, setAbovePng] = useState<string | null>(null);
  const [hasCommittedInitialBase, setHasCommittedInitialBase] = useState(false);
  const [isPadletLayerReady, setIsPadletLayerReady] = useState(false);
  // Monotonic counter: each render cycle gets a unique token.
  // Promise callbacks only commit results for the most recent token,
  // preventing stale async overwrites during rapid slide/dependency churn.
  const renderTokenRef = useRef(0);

  // Derive composition plan synchronously from current scene state.
  // Recomputes when slide changes or sceneElements/padlets update.
  const compositionPlan = useMemo(
    () => {
      if (!slide) return null;
      return planSlideComposition(slide, sceneElements, allPadlets);
    },
    // We intentionally depend on array identity — the parent recreates these when elements change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slide?.id, sceneElements, allPadlets],
  );

  // Viewport → slide scale (object-fit: contain)
  const scale =
    vpW > 0 && vpH > 0 && slide && slide.width > 0 && slide.height > 0
      ? Math.min(vpW / slide.width, vpH / slide.height)
      : 1;

  const displayW = slide ? slide.width * scale : vpW;
  const displayH = slide ? slide.height * scale : vpH;
  const offsetX = (vpW - displayW) / 2;
  const offsetY = (vpH - displayH) / 2;
  const hasVisibleBase = hasCommittedInitialBase || Boolean(belowPng);

  useEffect(() => {
    if (belowPng && !hasCommittedInitialBase) {
      setHasCommittedInitialBase(true);
    }
  }, [belowPng, hasCommittedInitialBase]);

  useEffect(() => {
    if (!hasVisibleBase || isPadletLayerReady) return;

    let cancelled = false;
    const rafId = window.requestAnimationFrame(() => {
      if (!cancelled) {
        setIsPadletLayerReady(true);
      }
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
    };
  }, [hasVisibleBase, isPadletLayerReady]);

  // Re-render Excalidraw layers whenever the composition plan, files, or scale change.
  // Old band PNGs remain visible until replacement PNGs are fully ready — no blank frames.
  useEffect(() => {
    if (!slide || !compositionPlan) return;

    // Each render cycle claims a unique token. Promise callbacks are silently
    // discarded if a newer cycle has already started (stale async overwrite guard).
    const token = ++renderTokenRef.current;
    let cancelled = false;

    const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    // Render at scale × DPR for crisp HiDPI display
    const renderScale = Math.max(0.5, scale) * dpr;

    // ── Below-band (white background + elements below first padlet) ──────────
    // NOTE: do NOT clear belowPng/abovePng here — old images stay visible until
    // the new canvas is ready, preventing blank intermediate frames.
    renderExcalidrawSlideBase({
      elements: compositionPlan.nativeBelowElements,
      frameElement: compositionPlan.frameElement,
      files,
      slide,
      opts: { scale: renderScale, paddingPx: 0, background: "#ffffff" },
      includeBackground: true,
    })
      .then((canvas) => {
        if (!cancelled && canvas && renderTokenRef.current === token) {
          setBelowPng(canvas.toDataURL("image/png"));
        }
      })
      .catch(() => { /* silent — previous PNG stays visible */ });

    // ── Above-band (transparent background + elements above last padlet) ─────
    if (compositionPlan.nativeAboveElements.length > 0) {
      renderExcalidrawSlideBase({
        elements: compositionPlan.nativeAboveElements,
        frameElement: compositionPlan.frameElement,
        files,
        slide,
        opts: { scale: renderScale, paddingPx: 0 },
        includeBackground: false,
      })
        .then((canvas) => {
          if (!cancelled && canvas && renderTokenRef.current === token) {
            setAbovePng(canvas.toDataURL("image/png"));
          }
        })
        .catch(() => { /* silent */ });
    }

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compositionPlan, files, scale]);

  if (!slide || vpW === 0 || vpH === 0) return null;

  const resolvedPadlets = compositionPlan?.resolvedPadlets ?? [];

  return (
    <div
      style={{
        position: "absolute",
        left: offsetX,
        top: offsetY,
        width: displayW,
        height: displayH,
        overflow: "hidden",
        opacity: hasVisibleBase ? 1 : 0,
        backgroundColor: "#ffffff",
        transition: hasCommittedInitialBase ? "none" : "opacity 0.12s ease-out",
      }}
    >
      {/*
        Layer 1: Excalidraw below-band PNG
        Renders async; white background shows while loading.
        z-index 1 so it sits below the padlet layer (z-index 2 via isolation).
      */}
      {belowPng && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={belowPng}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            display: "block",
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
      )}

      {/*
        Layer 2: Live padlet DOM cards
        Positioned using slide-local coordinates, then CSS-scaled.
        z-index managed by RuntimePadletLayer (isolation: isolate, zIndex: 2).
      */}
      {hasVisibleBase && isPadletLayerReady && (
        <RuntimePadletLayer
          resolvedPadlets={resolvedPadlets}
          scale={scale}
          slideWidth={slide.width}
          slideHeight={slide.height}
          allPadlets={allPadlets}
        />
      )}

      {/*
        Layer 3: Excalidraw above-band PNG (transparent bg, pointer-events off)
        Renders async; nothing shows in this layer until ready.
        z-index 3 so it sits on top of padlets (for Excalidraw shapes designed as foreground).
      */}
      {abovePng && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={abovePng}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            display: "block",
            pointerEvents: "none",
            zIndex: 3,
          }}
        />
      )}
    </div>
  );
}
