import type { CollabboardE2EBridge, RegisterE2EBridge } from './bridgeContract';

const GLOBAL_KEY = '__COLLABBOARD_E2E__';
const REGISTRATION_MARKER = 'COLLABBOARD_E2E_REAL_BRIDGE_REGISTRATION_V1';
const DIAGNOSTIC = `COLLABBOARD_E2E_BRIDGE_DIAGNOSTIC: simultaneous canvas ownership (${REGISTRATION_MARKER})`;

type Listener = (revision: number) => void;

const freezeDeep = (value: any): any => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) freezeDeep(value[key]);
  return Object.freeze(value);
};

const cloneDeep = (value: any): any => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const cloneFrozen = (value: any): any => freezeDeep(cloneDeep(value));

const selectedIds = (ids: Record<string, unknown> | undefined) => {
  const selected: Record<string, true> = {};
  for (const [id, value] of Object.entries(ids ?? {})) {
    if (value) selected[id] = true;
  }
  return Object.freeze(selected);
};

const safeNotify = (listeners: Set<Listener>, revision: number) => {
  for (const listener of Array.from(listeners)) {
    try {
      listener(revision);
    } catch {
      // Test observers must not affect application behavior.
    }
  }
};

export const registerE2EBridge: RegisterE2EBridge = (api) => {
  const current = (window as any)[GLOBAL_KEY] as CollabboardE2EBridge | undefined;
  if (current) throw new Error(DIAGNOSTIC);

  let revision = 0;
  let active = true;
  const listeners = new Set<Listener>();
  const instanceId = crypto.randomUUID();
  const unsubscribeApi = api.onChange(() => {
    if (!active) return;
    revision += 1;
    safeNotify(listeners, revision);
  });

  const bridge = Object.freeze({
    version: 1 as const,
    instanceId,
    getSceneElements: () => Object.freeze(api.getSceneElements().map((el) => cloneFrozen(el))),
    getViewport: () => {
      const state = api.getAppState();
      return Object.freeze({
        scrollX: Number(state.scrollX ?? 0),
        scrollY: Number(state.scrollY ?? 0),
        zoom: Object.freeze({ value: Number(state.zoom?.value ?? 1) }),
        offsetLeft: Number(state.offsetLeft ?? 0),
        offsetTop: Number(state.offsetTop ?? 0),
        selectedElementIds: selectedIds(state.selectedElementIds),
      });
    },
    getInteractionState: () => Object.freeze({
      resizingElementId: api.getAppState().resizingElement?.id ?? null,
    }),
    getSceneRevision: () => revision,
    subscribeToSceneChange: (callback: Listener) => {
      let subscribed = true;
      listeners.add(callback);
      return () => {
        if (!subscribed) return;
        subscribed = false;
        listeners.delete(callback);
      };
    },
  }) satisfies CollabboardE2EBridge;

  (window as any)[GLOBAL_KEY] = bridge;

  return () => {
    if (!active) return;
    active = false;
    listeners.clear();
    unsubscribeApi();
    if ((window as any)[GLOBAL_KEY] === bridge) {
      delete (window as any)[GLOBAL_KEY];
    }
  };
};
