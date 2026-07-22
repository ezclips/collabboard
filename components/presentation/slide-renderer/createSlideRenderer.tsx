/* eslint-disable @typescript-eslint/no-explicit-any */

import { createRoot } from "react-dom/client";
import PostCardContent from "@/components/collabboard/PostCardContent";
import type { FrameSlide, RenderSlideOptions } from "@/components/presentation/PresentationPanel";
import { getSlideRenderSignature as buildSlideRenderSignature } from "./getSlideRenderSignature";
import { mergeSlideLayers } from "./mergeSlideLayers";
import { planSlideComposition } from "./planSlideComposition";
import PresentationContainerCard from "./PresentationContainerCard";
import PresentationPadletCard from "./PresentationPadletCard";
import { renderExcalidrawSlideBase } from "./renderExcalidrawSlideBase";
import { resolveSlidePadlets } from "./resolveSlidePadlets";
import type { CreateSlideRendererArgs, SlideRenderHelpers } from "./types";

const USE_LEGACY_POSTCARD_OVERLAY = false;
const USE_Z_BAND_COMPOSITION = true;

function resolveSnapshotTimeoutMs(): number {
  if (
    process.env.NODE_ENV !== "production"
    && typeof window !== "undefined"
    && typeof (window as any).__patch101TimeoutOverrideMs === "number"
  ) {
    return (window as any).__patch101TimeoutOverrideMs;
  }
  return 3000;
}

function waitForSnapshotDiagramReadiness(
  host: HTMLElement,
  timeoutMs: number,
): Promise<{ waitedMs: number; timedOut: boolean; pendingCount: number }> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const deadline = startedAt + timeoutMs;
    const poll = () => {
      const pendingCount = host.querySelectorAll('[data-ai-render-state="loading"]').length;
      const waitedMs = Date.now() - startedAt;
      if (pendingCount === 0) {
        resolve({ waitedMs, timedOut: false, pendingCount });
        return;
      }
      if (Date.now() >= deadline) {
        resolve({ waitedMs, timedOut: true, pendingCount });
        return;
      }
      setTimeout(poll, 100);
    };
    poll();
  });
}

export function createSlideRenderer({
  getSceneElements,
  getPadlets,
  getFiles,
}: CreateSlideRendererArgs): SlideRenderHelpers {
  const renderPadletOverlayToCanvas = async (
    slideFrame: FrameSlide,
    slidePadlets: ReturnType<typeof resolveSlidePadlets>,
    opts: RenderSlideOptions,
  ): Promise<HTMLCanvasElement | null> => {
    const padlets = getPadlets();
    if (slidePadlets.length === 0) return null;

    const { default: html2canvas } = await import("html2canvas");
    const host = document.createElement("div");
    host.style.position = "fixed";
    host.style.left = "-100000px";
    host.style.top = "0";
    host.style.width = `${slideFrame.width}px`;
    host.style.height = `${slideFrame.height}px`;
    host.style.pointerEvents = "none";
    host.style.overflow = "hidden";
    host.style.background = "transparent";
    document.body.appendChild(host);

    const containsUnsupportedColorFunction = (value: string | null | undefined) =>
      typeof value === "string" && /okl(?:ab|ch)\(/i.test(value);

    const toExportSafeColor = (value: unknown, fallback: string) => {
      if (typeof value !== "string") return fallback;
      const trimmed = value.trim();
      if (!trimmed || containsUnsupportedColorFunction(trimmed)) return fallback;
      return trimmed;
    };

    const sanitizeExportOverlayColors = (root: HTMLElement) => {
      const exportSafeBorder = "rgba(229, 231, 235, 0.5)";
      const exportSafeText = "rgb(17, 24, 39)";
      const exportSafeBackground = "transparent";
      const exportSafeOutline = "transparent";
      const exportSafeShadow = "none";
      const nodes = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];

      for (const node of nodes) {
        const computed = window.getComputedStyle(node);
        const colorFallback = containsUnsupportedColorFunction(computed.color) ? exportSafeText : computed.color || exportSafeText;

        const styleFallbacks: Array<[string, string, string]> = [
          ["color", computed.color, colorFallback],
          ["background-color", computed.backgroundColor, exportSafeBackground],
          ["border-color", computed.borderColor, exportSafeBorder],
          ["border-top-color", computed.borderTopColor, exportSafeBorder],
          ["border-right-color", computed.borderRightColor, exportSafeBorder],
          ["border-bottom-color", computed.borderBottomColor, exportSafeBorder],
          ["border-left-color", computed.borderLeftColor, exportSafeBorder],
          ["box-shadow", computed.boxShadow, exportSafeShadow],
          ["outline-color", computed.outlineColor, exportSafeOutline],
          ["text-decoration-color", computed.textDecorationColor, colorFallback],
        ];

        for (const [property, value, fallback] of styleFallbacks) {
          if (containsUnsupportedColorFunction(value)) {
            node.style.setProperty(property, fallback);
          }
        }
      }
    };

    const root = createRoot(host);
    root.render(
      <div
        style={{
          position: "relative",
          width: `${slideFrame.width}px`,
          height: `${slideFrame.height}px`,
          overflow: "hidden",
          background: "transparent",
        }}
      >
        {slidePadlets.map(({ padlet, localX, localY, width, height, zIndex }) => (
          <div
            key={padlet.id}
            style={{
              position: "absolute",
              overflow: "hidden",
              left: `${localX}px`,
              top: `${localY}px`,
              width: `${width}px`,
              height: `${height}px`,
              zIndex,
            }}
          >
            <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
              {USE_LEGACY_POSTCARD_OVERLAY ? (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    overflow: "hidden",
                    borderRadius: "0.75rem",
                    border: "1px solid rgba(229, 231, 235, 0.5)",
                    boxShadow: "0 4px 12px rgba(15, 23, 42, 0.12)",
                    backgroundColor: toExportSafeColor(padlet.metadata?.backgroundColor, "#ffffff"),
                  }}
                >
                  {padlet.metadata?.topStrip && (
                    <div
                      style={{
                        height: "6px",
                        width: "100%",
                        flexShrink: 0,
                        backgroundColor: toExportSafeColor(padlet.metadata.topStrip, "rgba(59, 130, 246, 1)"),
                      }}
                    />
                  )}
                  <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
                    <PostCardContent padlet={padlet} allPadlets={padlets} />
                  </div>
                </div>
              ) : padlet.type === "container" ? (
                <PresentationContainerCard padlet={padlet} allPadlets={padlets} />
              ) : (
                <PresentationPadletCard padlet={padlet} />
              )}
            </div>
          </div>
        ))}
      </div>,
    );

    try {
      await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
      sanitizeExportOverlayColors(host);
      const pendingAtStart = host.querySelectorAll('[data-ai-render-state="loading"]').length;
      const waitResult = pendingAtStart > 0
        ? await waitForSnapshotDiagramReadiness(host, resolveSnapshotTimeoutMs())
        : { waitedMs: 0, timedOut: false, pendingCount: 0 };
      if (process.env.NODE_ENV !== "production") {
        window.dispatchEvent(new CustomEvent("collabboard-ai-snapshot-capture-wait", {
          detail: {
            waitedMs: waitResult.waitedMs,
            timedOut: waitResult.timedOut,
            pendingCount: waitResult.pendingCount,
          },
        }));
      }
      return await html2canvas(host, {
        backgroundColor: null,
        scale: opts.scale ?? 2,
        useCORS: true,
        logging: false,
        width: slideFrame.width,
        height: slideFrame.height,
      });
    } finally {
      root.unmount();
      host.remove();
    }
  };

  const renderSlideToPNG = async (slide: FrameSlide, opts: RenderSlideOptions): Promise<string> => {
    const activeElements = getSceneElements().filter((element: any) => !element.isDeleted);
    const files = getFiles() ?? null;

    if (!USE_Z_BAND_COMPOSITION) {
      const legacyBaseCanvas = await renderExcalidrawSlideBase({
        elements: activeElements,
        frameElement: activeElements.find((element: any) => element.id === slide.id) ?? null,
        files,
        slide,
        opts,
        includeBackground: true,
      });

      if (!legacyBaseCanvas) {
        throw new Error("Failed to render legacy Excalidraw slide base");
      }

      const legacyOverlayCanvas = await renderPadletOverlayToCanvas(
        slide,
        resolveSlidePadlets(slide, activeElements, getPadlets()),
        opts,
      );
      if (!legacyOverlayCanvas) {
        return legacyBaseCanvas.toDataURL("image/png");
      }

      const scale = opts.scale ?? 2;
      const padding = Math.max(0, Math.round((opts.paddingPx ?? 0) * scale));
      const legacyMergedCanvas = document.createElement("canvas");
      legacyMergedCanvas.width = legacyBaseCanvas.width;
      legacyMergedCanvas.height = legacyBaseCanvas.height;
      const legacyMergedCtx = legacyMergedCanvas.getContext("2d");
      if (!legacyMergedCtx) {
        return legacyBaseCanvas.toDataURL("image/png");
      }
      legacyMergedCtx.drawImage(legacyBaseCanvas, 0, 0);
      legacyMergedCtx.drawImage(
        legacyOverlayCanvas,
        0,
        0,
        legacyOverlayCanvas.width,
        legacyOverlayCanvas.height,
        padding,
        padding,
        Math.max(0, legacyMergedCanvas.width - padding * 2),
        Math.max(0, legacyMergedCanvas.height - padding * 2),
      );
      return legacyMergedCanvas.toDataURL("image/png");
    }

    const compositionPlan = planSlideComposition(slide, activeElements, getPadlets());
    const [nativeBelowCanvas, overlayCanvas, nativeAboveCanvas] = await Promise.all([
      renderExcalidrawSlideBase({
        elements: compositionPlan.nativeBelowElements,
        frameElement: compositionPlan.frameElement,
        files,
        slide,
        opts,
        includeBackground: true,
      }),
      renderPadletOverlayToCanvas(slide, compositionPlan.resolvedPadlets, opts),
      renderExcalidrawSlideBase({
        elements: compositionPlan.nativeAboveElements,
        frameElement: compositionPlan.frameElement,
        files,
        slide,
        opts,
        includeBackground: false,
      }),
    ]);

    if (!nativeBelowCanvas) {
      throw new Error("Failed to render z-band Excalidraw slide base");
    }

    const scale = opts.scale ?? 2;
    const padding = Math.max(0, Math.round((opts.paddingPx ?? 0) * scale));
    let paddedOverlayCanvas: HTMLCanvasElement | null = null;

    if (overlayCanvas) {
      paddedOverlayCanvas = document.createElement("canvas");
      paddedOverlayCanvas.width = nativeBelowCanvas.width;
      paddedOverlayCanvas.height = nativeBelowCanvas.height;
      const paddedOverlayCtx = paddedOverlayCanvas.getContext("2d");
      if (paddedOverlayCtx) {
        paddedOverlayCtx.drawImage(
          overlayCanvas,
          0,
          0,
          overlayCanvas.width,
          overlayCanvas.height,
          padding,
          padding,
          Math.max(0, paddedOverlayCanvas.width - padding * 2),
          Math.max(0, paddedOverlayCanvas.height - padding * 2),
        );
      }
    }

    const mergedCanvas = mergeSlideLayers({
      width: nativeBelowCanvas.width,
      height: nativeBelowCanvas.height,
      layers: [nativeBelowCanvas, paddedOverlayCanvas, nativeAboveCanvas],
    });

    return (mergedCanvas ?? nativeBelowCanvas).toDataURL("image/png");
  };

  const getSlideRenderSignature = (slide: FrameSlide) => (
    buildSlideRenderSignature(slide, getSceneElements(), getPadlets())
  );

  return {
    renderSlideToPNG,
    getSlideRenderSignature,
    resolveSlidePadlets: (slide, sceneElements = getSceneElements(), padlets = getPadlets()) => (
      resolveSlidePadlets(slide, sceneElements, padlets)
    ),
  };
}
