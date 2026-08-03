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

  const slideMembers = sceneElements
    .map((element: any, sceneIndex: number) => ({ element, sceneIndex }))
    .filter(({ element }) => {
      if (!element || element.isDeleted || element.id === slideFrame.id) return false;
      if (element.type === "embeddable" && typeof element.link === "string" && element.link.startsWith("padlet://")) {
        return resolveFrameMembership(element, frames).frameId === slideFrame.id;
      }
      return element.frameId === slideFrame.id;
    })
    .sort((a, b) => a.sceneIndex - b.sceneIndex);
  const localOrdinalById = new Map(slideMembers.map(({ element }, zIndex) => [element.id, zIndex]));

  return slideMembers
    .filter(({ element }) =>
      element.type === "embeddable"
      && !element.isDeleted
      && typeof element.link === "string"
      && element.link.startsWith("padlet://")
    )
    .map(({ element }) => {
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
        zIndex: localOrdinalById.get(element.id) ?? 0,
      } satisfies ResolvedSlidePadlet;
    })
    .filter((entry): entry is ResolvedSlidePadlet => entry !== null)
    .sort((a, b) => a.zIndex - b.zIndex);
}
