export function sortSlidesByPresentationOrder<
  T extends { order?: number | null; y: number; x: number },
>(slides: readonly T[]): T[] {
  return slides
    .map((slide, index) => ({ slide, index }))
    .sort((left, right) => {
      const leftOrder: number = Number.isFinite(left.slide.order) ? Number(left.slide.order) : Number.POSITIVE_INFINITY;
      const rightOrder: number = Number.isFinite(right.slide.order) ? Number(right.slide.order) : Number.POSITIVE_INFINITY;

      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      if (left.slide.y !== right.slide.y) return left.slide.y - right.slide.y;
      if (left.slide.x !== right.slide.x) return left.slide.x - right.slide.x;
      return left.index - right.index;
    })
    .map(({ slide }) => slide);
}
