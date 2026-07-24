import type { Padlet } from "@/types/collabboard";
import type { FrameSlide } from "@/components/presentation/PresentationPanel";
import { resolveFrameMembership } from "@/lib/infra/drawing/frameMembership";
import type { ResolvedSlidePadlet } from "./types";

export function resolveSlidePadlets(
  slideFrame: FrameSlide,
  sceneElements: readonly any[],
  availablePadlets: Padlet[],
): ResolvedSlidePadlet[] {
  const padletsById = new Map(availablePadlets.map((padlet) => [String(padlet.id), padlet] as const));
  const frames = sceneElements.filter((element: any) => element.type === "frame" && !element.isDeleted);

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

      const membership = resolveFrameMembership(element, frames);
      const inFrame = membership.frameId === slideFrame.id;

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
