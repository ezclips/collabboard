"use client";

import { useCallback, useState } from "react";
import { sanitizeClonedPostMetadata } from "@/lib/infra/collabboard/clonedPostMetadata";
import type { Padlet } from "@/types/collabboard";

type SceneElement = {
  id: string;
  type?: string;
  link?: string | null;
  version?: number;
  versionNonce?: number;
  updated?: number;
};

type ReorderAction = "bringToFront" | "sendToBack" | "bringForward" | "sendBackward";

function splitEmbeddables<T extends SceneElement>(elements: readonly T[]) {
  const embeddables: T[] = [];
  const others: T[] = [];

  for (const el of elements) {
    if (el.type === "embeddable") {
      embeddables.push(el);
    } else {
      others.push(el);
    }
  }

  return { embeddables, others };
}

function reorderElements<T extends { id: string }>(elements: readonly T[], targetId: string, action: ReorderAction) {
  const index = elements.findIndex((el) => el.id === targetId);
  if (index === -1) return [...elements];

  const target = elements[index];

  switch (action) {
    case "bringToFront":
      return [...elements.filter((el) => el.id !== targetId), target];

    case "sendToBack":
      return [target, ...elements.filter((el) => el.id !== targetId)];

    case "bringForward": {
      if (index === elements.length - 1) return [...elements];
      const next = elements[index + 1];
      const newArr = [...elements];
      newArr[index] = next;
      newArr[index + 1] = target;
      return newArr;
    }

    case "sendBackward": {
      if (index === 0) return [...elements];
      const prev = elements[index - 1];
      const newArr = [...elements];
      newArr[index] = prev;
      newArr[index - 1] = target;
      return newArr;
    }

    default:
      return [...elements];
  }
}

function reorderEmbeddables<T extends SceneElement>(elements: readonly T[], targetId: string, action: ReorderAction) {
  const { embeddables, others } = splitEmbeddables(elements);
  const reordered = reorderElements(embeddables, targetId, action);
  const updatedAt = Date.now();
  const touchedEmbeddables = reordered.map((el) => ({
    ...el,
    version: (el.version ?? 1) + 1,
    versionNonce: Math.floor(Math.random() * 1e9),
    updated: updatedAt,
  }));
  return [...others, ...touchedEmbeddables];
}

type UseCanvasActionsParams = {
  canvasId: string;
  padlets: Padlet[];
  masterPadletId?: string;
  appState: { zoom?: { value?: number }; scrollX?: number; scrollY?: number } | null;
  onAddPadlet: (postData: Partial<Padlet>) => Promise<Padlet | null>;
  onUpdatePadlet: (id: string, updates: Partial<Padlet>) => Promise<void>;
  onDeletePadlet?: (id: string) => Promise<void>;
  onPadletCreated?: (padlet: Padlet) => void;
  getSceneElements?: () => readonly SceneElement[];
  updateSceneElements?: (nextElements: readonly SceneElement[], options?: { commitToHistory?: boolean }) => void;
  onReorderPadlet?: (padletId: string, action: ReorderAction) => void;
};

export function useCanvasActions(params: UseCanvasActionsParams) {
  const {
    canvasId,
    appState,
    onAddPadlet,
    onUpdatePadlet,
    onDeletePadlet,
    onPadletCreated,
    getSceneElements,
    updateSceneElements,
    onReorderPadlet,
  } = params;

  const [clipboard, setClipboard] = useState<Padlet | null>(null);

  const handleDuplicatePadlet = useCallback(
    async (padlet: Padlet) => {
      const created = await onAddPadlet({
        board_id: canvasId,
        type: padlet.type,
        title: padlet.title,
        content: padlet.content,
        position_x: padlet.position_x + 30,
        position_y: padlet.position_y + 30,
        width: padlet.width,
        height: padlet.height,
        metadata: sanitizeClonedPostMetadata(padlet.metadata),
      });
      if (created) onPadletCreated?.(created);
    },
    [canvasId, onAddPadlet, onPadletCreated]
  );

  const handleDeletePadlet = useCallback(
    async (padlet: Padlet) => {
      if (onDeletePadlet) await onDeletePadlet(padlet.id);
    },
    [onDeletePadlet]
  );

  const reorderDrawingPadlet = useCallback((padlet: Padlet, action: ReorderAction) => {
    if (!getSceneElements || !updateSceneElements) return false;

    const elements = getSceneElements();
    const targetEmbeddable = elements.find(
      (el) => el.type === "embeddable" && el.link === `padlet://${padlet.id}`
    );
    if (!targetEmbeddable || !targetEmbeddable.id) return false;

    const nextElements = reorderEmbeddables(elements, targetEmbeddable.id, action);
    updateSceneElements(nextElements, { commitToHistory: true });
    onReorderPadlet?.(padlet.id, action);
    return true;
  }, [getSceneElements, onReorderPadlet, updateSceneElements]);

  const handleSendToBack = useCallback((p: Padlet) => {
    reorderDrawingPadlet(p, "sendToBack");
  }, [reorderDrawingPadlet]);

  const handleSendBackward = useCallback((p: Padlet) => {
    reorderDrawingPadlet(p, "sendBackward");
  }, [reorderDrawingPadlet]);

  const handleBringForward = useCallback((p: Padlet) => {
    reorderDrawingPadlet(p, "bringForward");
  }, [reorderDrawingPadlet]);

  const handleBringToFront = useCallback((p: Padlet) => {
    reorderDrawingPadlet(p, "bringToFront");
  }, [reorderDrawingPadlet]);

  const handleCopyPadlet = useCallback((p: Padlet) => {
    setClipboard(p);
  }, []);

  const handleCutPadlet = useCallback(
    async (p: Padlet) => {
      setClipboard(p);
      if (onDeletePadlet) await onDeletePadlet(p.id);
    },
    [onDeletePadlet]
  );

  const handlePastePadlet = useCallback(
    async (screenX: number, screenY: number) => {
      if (!clipboard) return;
      const zoom = appState?.zoom?.value || 1;
      const scrollX = appState?.scrollX || 0;
      const scrollY = appState?.scrollY || 0;
      const created = await onAddPadlet({
        board_id: canvasId,
        type: clipboard.type,
        title: clipboard.title,
        content: clipboard.content,
        position_x: screenX / zoom - scrollX,
        position_y: screenY / zoom - scrollY,
        width: clipboard.width,
        height: clipboard.height,
        metadata: sanitizeClonedPostMetadata(clipboard.metadata),
      });
      if (created) onPadletCreated?.(created);
    },
    [clipboard, appState, canvasId, onAddPadlet, onPadletCreated]
  );

  const handleAddPostAtViewportCenter = useCallback(
    async (overrides?: Partial<Padlet>) => {
      const zoom = appState?.zoom?.value || 1;
      const scrollX = appState?.scrollX || 0;
      const scrollY = appState?.scrollY || 0;
      const centerClientX = window.innerWidth / 2;
      const centerClientY = window.innerHeight / 2;
      const canvasX = centerClientX / zoom - scrollX;
      const canvasY = centerClientY / zoom - scrollY;
      const created = await onAddPadlet({
        board_id: canvasId,
        type: "note",
        title: "New Post",
        content: "",
        position_x: canvasX,
        position_y: canvasY,
        width: 320,
        height: 280,
        ...overrides,
      });
      if (created) onPadletCreated?.(created);
      return created;
    },
    [appState, canvasId, onAddPadlet, onPadletCreated]
  );

  const handleAddCommentPinAtCanvasPosition = useCallback(
    async (canvasX: number, canvasY: number, overrides?: Partial<Padlet>) => {
      const created = await onAddPadlet({
        board_id: canvasId,
        type: "comment",
        title: "New Comment",
        content: "",
        position_x: canvasX,
        position_y: canvasY,
        width: 320,
        height: 200,
        ...overrides,
      });
      if (created) onPadletCreated?.(created);
      return created;
    },
    [canvasId, onAddPadlet, onPadletCreated]
  );

  const renderPadletToCanvas = useCallback(async (p: Padlet) => {
    const el = document.querySelector(`[data-padlet-id="${p.id}"]`) as HTMLElement | null;
    if (!el) return null;
    const { default: html2canvas } = await import("html2canvas");
    return html2canvas(el, { useCORS: true, scale: 2, logging: false });
  }, []);

  const handleCopyAsPNG = useCallback(
    async (p: Padlet) => {
      const canvas = await renderPadletToCanvas(p);
      if (!canvas) return;
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        } catch {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${p.title || "post"}.png`;
          a.click();
          URL.revokeObjectURL(url);
        }
      });
    },
    [renderPadletToCanvas]
  );

  const handleExportAsPNG = useCallback(
    async (p: Padlet) => {
      const canvas = await renderPadletToCanvas(p);
      if (!canvas) return;
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `${p.title || "post"}.png`;
      a.click();
    },
    [renderPadletToCanvas]
  );

  const savePadletPosition = useCallback(
    async (id: string, x: number, y: number) => {
      await onUpdatePadlet(id, { position_x: x, position_y: y });
    },
    [onUpdatePadlet]
  );

  return {
    clipboard,
    handleDuplicatePadlet,
    handleDeletePadlet,
    handleSendToBack,
    handleSendBackward,
    handleBringForward,
    handleBringToFront,
    handleCopyPadlet,
    handleCutPadlet,
    handlePastePadlet,
    handleCopyAsPNG,
    handleExportAsPNG,
    savePadletPosition,
    handleAddPostAtViewportCenter,
    handleAddCommentPinAtCanvasPosition,
  };
}
