"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Padlet } from "@/types/collabboard";
import type { FrameSlide } from "@/components/presentation/PresentationPanel";
import { planSlideComposition } from "@/components/presentation/slide-renderer/planSlideComposition";
import { renderExcalidrawSlideBase } from "@/components/presentation/slide-renderer/renderExcalidrawSlideBase";
import { RuntimePadletLayer } from "./RuntimePadletLayer";

const DEV_RUNTIME_SLIDE_DIAGNOSTICS =
  process.env.NODE_ENV !== "production";

type RuntimeSlideRendererProps = {
  slide: FrameSlide | undefined;
  sceneElements: readonly any[];
  allPadlets: Padlet[];
  files: any;
  vpW: number;
  vpH: number;
};

type RuntimeSlideDiagnosticRecord = {
  kind: "plan-computed" | "effect-run" | "effect-cleanup" | "band-commit";
  timestamp: number;
  [key: string]: unknown;
};

function recordRuntimeSlideDiagnostic(record: RuntimeSlideDiagnosticRecord) {
  if (!DEV_RUNTIME_SLIDE_DIAGNOSTICS || typeof window === "undefined") return;

  try {
    const windowWithDiagnostics = window as typeof window & {
      __fable5RuntimeSlideDiagnostics?: RuntimeSlideDiagnosticRecord[];
    };
    const records = Array.isArray(windowWithDiagnostics.__fable5RuntimeSlideDiagnostics)
      ? windowWithDiagnostics.__fable5RuntimeSlideDiagnostics
      : [];
    records.push(record);
    if (records.length > 200) {
      records.splice(0, records.length - 200);
    }
    windowWithDiagnostics.__fable5RuntimeSlideDiagnostics = records;
  } catch {
    // Development-only diagnostics must never affect runtime behavior.
  }
}

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
      const plan = planSlideComposition(slide, sceneElements, allPadlets);
      recordRuntimeSlideDiagnostic({
        kind: "plan-computed",
        timestamp: Date.now(),
        slideId: slide.id,
        frameId: plan.frameElement?.id ?? null,
        inputElementCount: sceneElements.length,
        inputElementIds: sceneElements.map((element) => String(element?.id ?? "")),
        inputElementTypes: sceneElements.map((element) => String(element?.type ?? "")),
        inputElementFrameIds: sceneElements.map((element) => element?.frameId ?? null),
        inputElementDeletedFlags: sceneElements.map((element) => Boolean(element?.isDeleted)),
        inputElementIndexes: sceneElements.map((element, sceneIndex) => ({
          id: String(element?.id ?? ""),
          sceneIndex,
          index: typeof element?.index === "number" ? element.index : null,
        })),
        padletIds: allPadlets.map((padlet) => String(padlet.id)),
        padletZIndexes: allPadlets.map((padlet) => sceneElements.findIndex((element) => element?.link === `padlet://${padlet.id}`)),
        resolvedPadletIds: plan.resolvedPadlets.map((entry) => String(entry.padlet.id)),
        resolvedPadletZIndexes: plan.resolvedPadlets.map((entry) => entry.zIndex),
        nativeBelowIds: plan.nativeBelowElements.map((element) => String(element?.id ?? "")),
        nativeAboveIds: plan.nativeAboveElements.map((element) => String(element?.id ?? "")),
        nativeBelowCount: plan.nativeBelowElements.length,
        nativeAboveCount: plan.nativeAboveElements.length,
        unresolvedPadletIds: allPadlets
          .map((padlet) => String(padlet.id))
          .filter((padletId) => !plan.resolvedPadlets.some((entry) => String(entry.padlet.id) === padletId)),
        frameGeometry: {
          x: typeof plan.frameElement?.x === "number" ? plan.frameElement.x : null,
          y: typeof plan.frameElement?.y === "number" ? plan.frameElement.y : null,
          width: typeof plan.frameElement?.width === "number" ? plan.frameElement.width : null,
          height: typeof plan.frameElement?.height === "number" ? plan.frameElement.height : null,
        },
      });
      return plan;
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
    recordRuntimeSlideDiagnostic({
      kind: "effect-run",
      timestamp: Date.now(),
      token,
      slideId: slide.id,
      frameId: compositionPlan.frameElement?.id ?? null,
      planPresent: Boolean(compositionPlan),
      nativeBelowIds: compositionPlan.nativeBelowElements.map((element) => String(element?.id ?? "")),
      nativeBelowCount: compositionPlan.nativeBelowElements.length,
      nativeAboveIds: compositionPlan.nativeAboveElements.map((element) => String(element?.id ?? "")),
      nativeAboveCount: compositionPlan.nativeAboveElements.length,
      belowBranchCondition: true,
      aboveBranchCondition: compositionPlan.nativeAboveElements.length > 0,
      belowPngPresent: Boolean(belowPng),
      abovePngPresent: Boolean(abovePng),
    });

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
          const dataUrl = canvas.toDataURL("image/png");
          recordRuntimeSlideDiagnostic({
            kind: "band-commit",
            timestamp: Date.now(),
            band: "below",
            token,
            slideId: slide.id,
            frameId: compositionPlan.frameElement?.id ?? null,
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
            dataUrlLength: dataUrl.length,
            cancelled,
            guardPassed: true,
          });
          setBelowPng(dataUrl);
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
            const dataUrl = canvas.toDataURL("image/png");
            recordRuntimeSlideDiagnostic({
              kind: "band-commit",
              timestamp: Date.now(),
              band: "above",
              token,
              slideId: slide.id,
              frameId: compositionPlan.frameElement?.id ?? null,
              canvasWidth: canvas.width,
              canvasHeight: canvas.height,
              dataUrlLength: dataUrl.length,
              cancelled,
              guardPassed: true,
            });
            setAbovePng(dataUrl);
          }
        })
        .catch(() => { /* silent */ });
    }

    return () => {
      const cancelledBeforeCleanup = cancelled;
      cancelled = true;
      recordRuntimeSlideDiagnostic({
        kind: "effect-cleanup",
        timestamp: Date.now(),
        token,
        slideId: slide.id,
        frameId: compositionPlan.frameElement?.id ?? null,
        nativeBelowCount: compositionPlan.nativeBelowElements.length,
        nativeAboveCount: compositionPlan.nativeAboveElements.length,
        cancelledBeforeCleanup,
        cancelledAfterCleanup: cancelled,
      });
    };
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
