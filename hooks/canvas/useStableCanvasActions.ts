'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';

type AnyFn = (...args: any[]) => any;
type ActionMap = Record<string, AnyFn>;

export type StableCanvasActions<T extends ActionMap> = {
  [K in keyof T]: (...args: Parameters<T[K]>) => ReturnType<T[K]>;
};

export function useStableCanvasActions<T extends ActionMap>(actions: T): StableCanvasActions<T> {
  const actionsRef = useRef(actions);

  useLayoutEffect(() => {
    actionsRef.current = actions;
  }, [actions]);

  return useMemo(() => {
    const stableActions = {} as StableCanvasActions<T>;

    for (const key of Object.keys(actions) as Array<keyof T>) {
      stableActions[key] = ((...args: Parameters<T[typeof key]>) => {
        return actionsRef.current[key](...args);
      }) as StableCanvasActions<T>[typeof key];
    }

    return stableActions;
  }, []);
}
