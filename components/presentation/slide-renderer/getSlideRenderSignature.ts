/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Padlet } from "@/types/collabboard";
import type { CanvasLine } from "@/types/collabboard";
import type { FrameSlide } from "@/components/presentation/PresentationPanel";
import { resolveCanvasLineSlideMemberships } from "@/lib/infra/drawing/canvasLineSlideMembership";
import { planSlideComposition } from "./planSlideComposition";

const SLIDE_RENDERER_VERSION = "phase3-renderer-v2-canvas-lines";

function summarizePadletMetadata(padlet: Padlet) {
  const metadata = padlet.metadata ?? {};
  return {
    backgroundColor: metadata.backgroundColor ?? null,
    cardColor: metadata.cardColor ?? null,
    topStrip: metadata.topStrip ?? null,
    textColor: metadata.textColor ?? null,
    caption: metadata.caption ?? null,
    imageUrl: metadata.imageUrl ?? null,
    linkUrl: metadata.linkUrl ?? null,
    linkTitle: metadata.linkTitle ?? null,
    linkDescription: metadata.linkDescription ?? null,
    linkImage: metadata.linkImage ?? null,
    linkDomain: metadata.linkDomain ?? null,
    linkCaption: metadata.linkCaption ?? null,
    linkCaptionColor: metadata.linkCaptionColor ?? null,
    linkFavicon: metadata.linkFavicon ?? null,
    displayMode: metadata.displayMode ?? null,
    todoTitle: metadata.todoTitle ?? null,
    tasks: Array.isArray(metadata.tasks)
      ? metadata.tasks.map((task) => ({
        id: task.id,
        text: task.text,
        completed: task.completed,
        dueDate: task.dueDate ?? null,
        assignee: task.assignee ?? null,
        color: task.color ?? null,
      }))
      : null,
    childPadletIds: Array.isArray(metadata.childPadletIds) ? [...metadata.childPadletIds] : [],
    commentsCount: Array.isArray(metadata.comments) ? metadata.comments.length : 0,
    source: metadata.source ?? null,
    importKind: metadata.importKind ?? null,
    importMimeType: metadata.importMimeType ?? null,
    svgUrl: metadata.svgUrl ?? null,
    previewUrl: metadata.previewUrl ?? null,
    iconColor: metadata.iconColor ?? null,
    iconBgColor: metadata.iconBgColor ?? null,
    topStripColor: metadata.topStripColor ?? null,
    coverChildId: metadata.coverChildId ?? null,
    coverPadletId: metadata.coverPadletId ?? null,
    coverChildPadletId: metadata.coverChildPadletId ?? null,
    importFileName: metadata.importFileName ?? null,
    aiPrompt: metadata.aiPrompt ?? null,
    aiComponentCode: metadata.aiComponentCode ?? null,
  };
}

function buildPadletRenderState(
  padlet: Padlet,
  padletsById: Map<string, Padlet>,
  maxDepth: number,
  visited: Set<string>,
): Record<string, unknown> {
  if (visited.has(padlet.id)) {
    return { id: padlet.id, recursive: true };
  }

  visited.add(padlet.id);
  const metadata = padlet.metadata ?? {};
  const childIds = Array.isArray(metadata.childPadletIds)
    ? metadata.childPadletIds.filter((id): id is string => typeof id === "string")
    : [];
  const children: Record<string, unknown>[] = maxDepth > 0
    ? childIds
      .map((childId) => padletsById.get(childId))
      .filter((child): child is Padlet => Boolean(child))
      .map((child) => buildPadletRenderState(child, padletsById, maxDepth - 1, visited))
    : [];

  visited.delete(padlet.id);

  return {
    id: padlet.id,
    type: padlet.type,
    updated_at: padlet.updated_at ?? null,
    title: padlet.title ?? "",
    content: padlet.content ?? "",
    file_url: padlet.file_url ?? null,
    file_name: padlet.file_name ?? null,
    file_type: padlet.file_type ?? null,
    image_url: padlet.image_url ?? null,
    width: padlet.width ?? null,
    height: padlet.height ?? null,
    metadata: summarizePadletMetadata(padlet),
    childCount: childIds.length,
    children,
  };
}

export function getSlideRenderSignature(
  slideFrame: FrameSlide,
  sceneElements: readonly any[],
  availablePadlets: Padlet[],
  canvasLines: readonly CanvasLine[] = [],
) {
  const padletsById = new Map(availablePadlets.map((padlet) => [String(padlet.id), padlet] as const));
  const compositionPlan = planSlideComposition(slideFrame, sceneElements, availablePadlets, canvasLines);
  const resolvedPadlets = compositionPlan.resolvedPadlets;
  const frames = sceneElements
    .filter((element: any) => element.type === "frame" && !element.isDeleted)
    .map((element: any) => ({
      id: String(element.id),
      x: Number(element.x) || 0,
      y: Number(element.y) || 0,
      width: Number(element.width) || 0,
      height: Number(element.height) || 0,
    }));

  const nativeSceneSignature = sceneElements
    .filter((element: any) => !element.isDeleted && element.frameId === slideFrame.id)
    .map((element: any) => ({
      id: element.id,
      type: element.type,
      version: element.version ?? 0,
      versionNonce: element.versionNonce ?? 0,
      frameId: element.frameId ?? null,
    }));

  const embeddableOverlaySignature = resolvedPadlets.map(({ padlet, embeddable, localX, localY, width, height, zIndex }) => ({
    embeddableId: embeddable.id,
    embeddableVersion: embeddable.version ?? 0,
    embeddableVersionNonce: embeddable.versionNonce ?? 0,
    frameId: embeddable.frameId ?? null,
    x: embeddable.x,
    y: embeddable.y,
    width,
    height,
    localX,
    localY,
    zIndex,
    link: embeddable.link ?? null,
    padlet: buildPadletRenderState(padlet, padletsById, 2, new Set<string>()),
  }));
  const canvasLineSignature = resolveCanvasLineSlideMemberships(canvasLines, frames)
    .filter((entry) => entry.frameId === slideFrame.id)
    .map(({ line, frameId, bounds }) => ({
      id: line.id,
      frameId,
      bounds,
      coord_space: line.coord_space ?? null,
      points: Array.isArray(line.points)
        ? line.points.map((point) => ({
          x: point.x,
          y: point.y,
          type: point.type,
        }))
        : null,
      legacy: {
        start_x: line.start_x,
        start_y: line.start_y,
        control_x: line.control_x,
        control_y: line.control_y,
        end_x: line.end_x,
        end_y: line.end_y,
      },
      start_arrow: Boolean(line.start_arrow),
      end_arrow: Boolean(line.end_arrow),
      color: line.color ?? null,
      stroke_width: line.stroke_width ?? null,
      dashed: Boolean(line.dashed),
      label: line.label ?? "",
      label_position: line.label_position ?? null,
      label_text_color: line.label_text_color ?? null,
      label_background_color: line.label_background_color ?? null,
      layer_plane: line.layer_plane ?? null,
      z_index: line.z_index ?? null,
    }));

  return JSON.stringify({
    rendererVersion: SLIDE_RENDERER_VERSION,
    slide: {
      id: slideFrame.id,
      x: slideFrame.x,
      y: slideFrame.y,
      width: slideFrame.width,
      height: slideFrame.height,
    },
    nativeSceneSignature,
    compositionBands: {
      nativeBelow: compositionPlan.nativeBelowElements.map((element) => element.id),
      canvasLineBack: compositionPlan.backCanvasLinePayloads.map((payload) => payload.id),
      canvasLineFront: compositionPlan.frontCanvasLinePayloads.map((payload) => payload.id),
      nativeAbove: compositionPlan.nativeAboveElements.map((element) => element.id),
    },
    embeddableOverlaySignature,
    canvasLineSignature,
  });
}
