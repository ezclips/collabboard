import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';

export type E2EViewport = Readonly<{
  scrollX: number;
  scrollY: number;
  zoom: Readonly<{ value: number }>;
  offsetLeft: number;
  offsetTop: number;
  selectedElementIds: Readonly<Record<string, true>>;
}>;

export type E2EInteractionState = Readonly<{
  resizingElementId: string | null;
}>;

export type CollabboardE2EBridge = Readonly<{
  version: 1;
  instanceId: string;
  getSceneElements(): readonly unknown[];
  getViewport(): E2EViewport;
  getInteractionState(): E2EInteractionState;
  getSceneRevision(): number;
  subscribeToSceneChange(callback: (revision: number) => void): () => void;
}>;

export type RegisterE2EBridge = (
  api: ExcalidrawImperativeAPI,
) => () => void;
