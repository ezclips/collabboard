import type { Padlet } from "@/types/collabboard";
import type { FrameSlide } from "@/components/presentation/PresentationPanel";
import type { ResolvedSlidePadlet } from "./types";

export function resolveSlidePadlets(
  slideFrame: FrameSlide,
  sceneElements: readonly any[],
  availablePadlets: Padlet[],
): ResolvedSlidePadlet[] {
  const padletsById = new Map(availablePadlets.map((padlet) => [String(padlet.id), padlet] as const));
  const frameRight = slideFrame.x + slideFrame.width;
  const frameBottom = slideFrame.y + slideFrame.height;

  return sceneElements
    .map((element: any, zIndex: number) => ({ element, zIndex }))
    .filter(({ element }) =>
      element.type === "embeddable"
      && !element.isDeleted
      && typeof element.link === "string"
      && element.link.startsWith("padlet://")
    )
    .map(({ element, zIndex }) => {
      const padletId = element.link.replace("padlet://", "");
      const padlet = padletsById.get(padletId);
      if (!padlet || padlet.type === "drawing") return null;

      const elementRight = element.x + element.width;
      const elementBottom = element.y + element.height;
      const overlapsFrame =
        element.x < frameRight
        && elementRight > slideFrame.x
        && element.y < frameBottom
        && elementBottom > slideFrame.y;
      const inFrame = element.frameId ? element.frameId === slideFrame.id : overlapsFrame;

      if (!inFrame) return null;

      return {
        padlet,
        embeddable: element,
        localX: element.x - slideFrame.x,
        localY: element.y - slideFrame.y,
        width: element.width,
        height: element.height,
        zIndex,
      } satisfies ResolvedSlidePadlet;
    })
    .filter((entry): entry is ResolvedSlidePadlet => entry !== null)
    .sort((a, b) => a.zIndex - b.zIndex);
}
