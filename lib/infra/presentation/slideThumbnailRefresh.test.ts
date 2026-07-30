import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  getSlideThumbnailCacheKey,
  selectQueuedSlidesForActiveThumbnailPass,
  selectSlidesForThumbnailRefresh,
  shouldAcceptSlideThumbnailRender,
  SLIDE_THUMBNAIL_REFRESH_DEBOUNCE_MS,
} from "./slideThumbnailRefresh";

const slide = (id: string, version = 0, overrides = {}) => ({
  id,
  x: 0,
  y: 0,
  width: 640,
  height: 360,
  contentVersion: version,
  ...overrides,
});

describe("slide thumbnail refresh scheduling", () => {
  it("uses a bounded debounce for automatic thumbnail refreshes", () => {
    expect(SLIDE_THUMBNAIL_REFRESH_DEBOUNCE_MS).toBe(250);
  });

  it("uses render signatures before geometry/content fallback keys", () => {
    expect(getSlideThumbnailCacheKey(slide("a", 3, { renderSignature: "sig-a" }))).toBe("sig-a");
    expect(getSlideThumbnailCacheKey(slide("a", 3))).toBe("0,0,640,360,3");
  });

  it("selects only changed slides for automatic refresh", () => {
    const slides = [slide("a", 1), slide("b", 2), slide("c", 3)];
    const result = selectSlidesForThumbnailRefresh({
      slides,
      renderedKeys: {
        a: getSlideThumbnailCacheKey(slide("a", 1)),
        b: "stale",
        c: getSlideThumbnailCacheKey(slide("c", 3)),
      },
      inFlightIds: new Set(),
    });

    expect(result.requests.map((request) => request.id)).toEqual(["b"]);
    expect(result.deferredIds).toEqual([]);
  });

  it("skips unchanged slides for automatic refresh", () => {
    const slides = [slide("a", 1), slide("b", 2)];
    const result = selectSlidesForThumbnailRefresh({
      slides,
      renderedKeys: Object.fromEntries(slides.map((entry) => [entry.id, getSlideThumbnailCacheKey(entry)])),
      inFlightIds: new Set(),
    });

    expect(result.requests).toEqual([]);
    expect(result.deferredIds).toEqual([]);
  });

  it("defers affected slides already rendering so the latest state is rendered after completion", () => {
    const result = selectSlidesForThumbnailRefresh({
      slides: [slide("a", 4), slide("b", 4)],
      renderedKeys: { a: "old", b: "old" },
      inFlightIds: new Set(["a"]),
    });

    expect(result.requests.map((request) => request.id)).toEqual(["b"]);
    expect(result.deferredIds).toEqual(["a"]);
  });

  it("forces all current slides for the panel refresh action", () => {
    const slides = [slide("a", 1), slide("b", 2)];
    const result = selectSlidesForThumbnailRefresh({
      slides,
      renderedKeys: Object.fromEntries(slides.map((entry) => [entry.id, getSlideThumbnailCacheKey(entry)])),
      inFlightIds: new Set(),
      forcedIds: null,
    });

    expect(result.requests.map((request) => ({ id: request.id, forced: request.forced }))).toEqual([
      { id: "a", forced: true },
      { id: "b", forced: true },
    ]);
  });

  it("queues automatic changes observed during an active pass", () => {
    const result = selectQueuedSlidesForActiveThumbnailPass({
      slides: [slide("a", 1), slide("b", 2), slide("c", 3)],
      renderedKeys: {
        a: getSlideThumbnailCacheKey(slide("a", 1)),
        b: "old",
        c: "old",
      },
      inFlightIds: new Set(["c"]),
    });

    expect(result).toEqual({
      forceAll: false,
      forcedSlideIds: [],
      changedSlideIds: ["b", "c"],
    });
  });

  it("queues forced refresh-all observed during an active pass", () => {
    const result = selectQueuedSlidesForActiveThumbnailPass({
      slides: [slide("a", 1), slide("b", 2)],
      renderedKeys: {},
      inFlightIds: new Set(["a"]),
      forcedIds: null,
    });

    expect(result).toEqual({
      forceAll: true,
      forcedSlideIds: [],
      changedSlideIds: [],
    });
  });

  it("deduplicates multiple pending requests for the same slide during an active pass", () => {
    const result = selectQueuedSlidesForActiveThumbnailPass({
      slides: [slide("a", 1), slide("b", 2)],
      renderedKeys: {},
      inFlightIds: new Set(),
      forcedIds: new Set(["b", "b", "missing"]),
    });

    expect(result).toEqual({
      forceAll: false,
      forcedSlideIds: ["b"],
      changedSlideIds: [],
    });
  });

  it("forces only the requested slide for the per-slide refresh action", () => {
    const slides = [slide("a", 1), slide("b", 2)];
    const result = selectSlidesForThumbnailRefresh({
      slides,
      renderedKeys: Object.fromEntries(slides.map((entry) => [entry.id, getSlideThumbnailCacheKey(entry)])),
      inFlightIds: new Set(),
      forcedIds: new Set(["b"]),
    });

    expect(result.requests.map((request) => request.id)).toEqual(["b"]);
  });

  it("rejects an older async render when a newer request exists", () => {
    expect(shouldAcceptSlideThumbnailRender({
      requestId: 1,
      latestRequestId: 2,
      requestedCacheKey: "old",
      latestCacheKey: "new",
    })).toBe(false);
  });

  it("rejects a render whose captured key no longer matches the latest slide", () => {
    expect(shouldAcceptSlideThumbnailRender({
      requestId: 2,
      latestRequestId: 2,
      requestedCacheKey: "old",
      latestCacheKey: "new",
    })).toBe(false);
  });

  it("lets the latest signature win by accepting the newest request for the newest key", () => {
    expect(shouldAcceptSlideThumbnailRender({
      requestId: 7,
      latestRequestId: 7,
      requestedCacheKey: "sig-new",
      latestCacheKey: "sig-new",
    })).toBe(true);
  });

  it("rejects stale output even when it matches the current cache key but is not the latest request", () => {
    expect(shouldAcceptSlideThumbnailRender({
      requestId: 6,
      latestRequestId: 7,
      requestedCacheKey: "sig-new",
      latestCacheKey: "sig-new",
    })).toBe(false);
  });

  it("ignores a removed slide by rejecting when no latest cache key exists", () => {
    expect(shouldAcceptSlideThumbnailRender({
      requestId: 8,
      latestRequestId: 8,
      requestedCacheKey: "removed",
      latestCacheKey: undefined,
    })).toBe(false);
  });

  it("does not queue an automatic follow-up when signatures have stabilized", () => {
    const slides = [slide("a", 1), slide("b", 2)];
    const result = selectQueuedSlidesForActiveThumbnailPass({
      slides,
      renderedKeys: Object.fromEntries(slides.map((entry) => [entry.id, getSlideThumbnailCacheKey(entry)])),
      inFlightIds: new Set(),
    });

    expect(result.changedSlideIds).toEqual([]);
  });

  it("accepts only the newest render for the current cache key", () => {
    expect(shouldAcceptSlideThumbnailRender({
      requestId: 3,
      latestRequestId: 3,
      requestedCacheKey: "current",
      latestCacheKey: "current",
    })).toBe(true);
  });

  it("keeps the refresh-all action wired to PresentationPanel", () => {
    const panel = fs.readFileSync(
      path.join(process.cwd(), "components/presentation/PresentationPanel.tsx"),
      "utf8",
    );

    expect(panel).toContain("refreshAllThumbnails");
    expect(panel).toContain('aria-label="Refresh slide previews"');
    expect(panel).toContain("onClick={refreshAllThumbnails}");
  });

  it("does not expose the removed per-slide refresh API", () => {
    const hook = fs.readFileSync(
      path.join(process.cwd(), "components/presentation/useSlideThumbnails.ts"),
      "utf8",
    );

    expect(hook).not.toContain("refreshSlideThumbnail");
  });
});
