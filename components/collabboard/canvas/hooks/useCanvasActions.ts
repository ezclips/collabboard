"use client";

import { useCallback, useState } from "react";
import type { Padlet } from "@/types/collabboard";

type UseCanvasActionsParams = {
  canvasId: string;
  padlets: Padlet[];
  masterPadletId?: string;
  appState: { zoom?: { value?: number }; scrollX?: number; scrollY?: number } | null;
  onAddPadlet: (postData: Partial<Padlet>) => Promise<Padlet | null>;
  onUpdatePadlet: (id: string, updates: Partial<Padlet>) => Promise<void>;
  onDeletePadlet?: (id: string) => Promise<void>;
  onPadletCreated?: (padlet: Padlet) => void;
};

export function useCanvasActions({
  canvasId,
  padlets,
  masterPadletId,
  appState,
  onAddPadlet,
  onUpdatePadlet,
  onDeletePadlet,
  onPadletCreated,
}: UseCanvasActionsParams) {
  const [clipboard, setClipboard] = useState<Padlet | null>(null);
  const [zOrders, setZOrders] = useState<Record<string, number>>({});

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
        metadata: padlet.metadata,
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

  // Base z-index for padlets. Excalidraw's layerUI (menus/toolbars) sits at z-index 4,
  // so padlets live at 3 — below the UI layer but above the canvas (z-index 2).
  const BASE_Z = 3;

  const getZ = useCallback((id: string) => zOrders[id] ?? BASE_Z, [zOrders]);

  const allZ = useCallback(() => {
    const ids = padlets.filter((p) => p.type !== "drawing" && p.id !== masterPadletId).map((p) => p.id);
    return ids.map((id) => zOrders[id] ?? BASE_Z);
  }, [padlets, masterPadletId, zOrders]);

  const handleSendToBack = useCallback(
    (p: Padlet) => {
      setZOrders((prev) => ({ ...prev, [p.id]: Math.min(...allZ(), BASE_Z) - 1 }));
    },
    [allZ]
  );

  const handleSendBackward = useCallback((p: Padlet) => {
    setZOrders((prev) => ({ ...prev, [p.id]: (prev[p.id] ?? BASE_Z) - 1 }));
  }, []);

  const handleBringForward = useCallback((p: Padlet) => {
    setZOrders((prev) => ({ ...prev, [p.id]: (prev[p.id] ?? BASE_Z) + 1 }));
  }, []);

  const handleBringToFront = useCallback(
    (p: Padlet) => {
      setZOrders((prev) => ({ ...prev, [p.id]: Math.max(...allZ(), BASE_Z) + 1 }));
    },
    [allZ]
  );

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
        metadata: clipboard.metadata,
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
    getZ,
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
