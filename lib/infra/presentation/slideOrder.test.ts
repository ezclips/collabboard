import { describe, expect, it } from "vitest";

import { sortSlidesByPresentationOrder } from "./slideOrder";

describe("sortSlidesByPresentationOrder", () => {
  it("sorts finite explicit orders ascending", () => {
    const slides = [
      { id: "two", order: 2, x: 30, y: 30 },
      { id: "one", order: 1, x: 20, y: 20 },
      { id: "three", order: 3, x: 10, y: 10 },
    ];

    expect(sortSlidesByPresentationOrder(slides).map((slide) => slide.id)).toEqual(["one", "two", "three"]);
  });

  it("places unordered slides after explicitly ordered slides", () => {
    const slides = [
      { id: "unordered", x: 10, y: 10 },
      { id: "ordered-two", order: 2, x: 30, y: 30 },
      { id: "ordered-one", order: 1, x: 20, y: 20 },
      { id: "unordered-null", order: null, x: 0, y: 0 },
    ];

    expect(sortSlidesByPresentationOrder(slides).map((slide) => slide.id)).toEqual([
      "ordered-one",
      "ordered-two",
      "unordered-null",
      "unordered",
    ]);
  });

  it("sorts unordered slides by y then x", () => {
    const slides = [
      { id: "lower-right", x: 100, y: 200 },
      { id: "higher-left", x: 10, y: 50 },
      { id: "higher-right", x: 50, y: 50 },
    ];

    expect(sortSlidesByPresentationOrder(slides).map((slide) => slide.id)).toEqual([
      "higher-left",
      "higher-right",
      "lower-right",
    ]);
  });

  it("uses y then x when explicit orders are equal", () => {
    const slides = [
      { id: "same-order-lower", order: 4, x: 90, y: 100 },
      { id: "same-order-higher-right", order: 4, x: 80, y: 10 },
      { id: "same-order-higher-left", order: 4, x: 20, y: 10 },
    ];

    expect(sortSlidesByPresentationOrder(slides).map((slide) => slide.id)).toEqual([
      "same-order-higher-left",
      "same-order-higher-right",
      "same-order-lower",
    ]);
  });

  it("treats NaN, Infinity, and -Infinity as unordered", () => {
    const slides = [
      { id: "nan", order: Number.NaN, x: 30, y: 10 },
      { id: "infinity", order: Number.POSITIVE_INFINITY, x: 20, y: 10 },
      { id: "negative-infinity", order: Number.NEGATIVE_INFINITY, x: 10, y: 10 },
      { id: "ordered", order: 1, x: 999, y: 999 },
    ];

    expect(sortSlidesByPresentationOrder(slides).map((slide) => slide.id)).toEqual([
      "ordered",
      "negative-infinity",
      "infinity",
      "nan",
    ]);
  });

  it("does not mutate the input array or slide objects", () => {
    const slides = [
      { id: "b", order: 2, x: 20, y: 20, meta: { tone: "warm" } },
      { id: "a", order: 1, x: 10, y: 10, meta: { tone: "cool" } },
    ];
    const sourceSnapshot = slides.map((slide) => ({
      ...slide,
      meta: { ...slide.meta },
    }));

    const ordered = sortSlidesByPresentationOrder(slides);

    expect(ordered).not.toBe(slides);
    expect(slides).toEqual(sourceSnapshot);
    expect(ordered[0]).toBe(slides[1]);
    expect(ordered[1]).toBe(slides[0]);
  });

  it("matches the canonical comparator on a mixed fixture", () => {
    const slides = [
      { id: "missing-order-low", x: 0, y: 300 },
      { id: "finite-two", order: 2, x: 500, y: 500 },
      { id: "finite-one-low", order: 1, x: 400, y: 400 },
      { id: "finite-one-high-right", order: 1, x: 50, y: 100 },
      { id: "missing-order-high-right", x: 100, y: 200 },
      { id: "finite-one-high-left", order: 1, x: 10, y: 100 },
      { id: "nan-order", order: Number.NaN, x: 5, y: 250 },
    ];

    const expected = [...slides]
      .map((slide, index) => ({ slide, index }))
      .sort((left, right) => {
        const leftOrder: number = Number.isFinite(left.slide.order) ? Number(left.slide.order) : Number.POSITIVE_INFINITY;
        const rightOrder: number = Number.isFinite(right.slide.order) ? Number(right.slide.order) : Number.POSITIVE_INFINITY;
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        if (left.slide.y !== right.slide.y) return left.slide.y - right.slide.y;
        if (left.slide.x !== right.slide.x) return left.slide.x - right.slide.x;
        return left.index - right.index;
      })
      .map(({ slide }) => slide.id);

    expect(sortSlidesByPresentationOrder(slides).map((slide) => slide.id)).toEqual(expected);
  });
});
