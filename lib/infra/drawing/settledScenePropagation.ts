/**
 * PATCH-128: debounces rapid Excalidraw onChange traffic into one settled
 * propagation per real scene-revision change, while ignoring the continuous
 * no-op onChange calls Excalidraw emits at rest.
 *
 * Keeps "last revision observed" and "last revision successfully propagated"
 * as two distinct values. Collapsing them into one ref causes the debounce to
 * reset forever on no-op traffic, since the comparison value can then only be
 * advanced by the very callback it is gating (PATCH-128 diagnostic evidence).
 */

export interface SettledScenePropagationOptions<TElement> {
  getSceneVersion: (elements: readonly TElement[]) => number;
  onSettle: (snapshot: readonly TElement[]) => void;
  debounceMs?: number;
  setTimeoutFn?: (handler: () => void, timeoutMs: number) => number;
  clearTimeoutFn?: (id: number) => void;
}

export interface SettledScenePropagation<TElement> {
  onChange: (activeElements: readonly TElement[]) => void;
  cleanup: () => void;
}

const DEFAULT_DEBOUNCE_MS = 150;

export function createSettledScenePropagation<TElement>(
  options: SettledScenePropagationOptions<TElement>,
): SettledScenePropagation<TElement> {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const scheduleTimeout = options.setTimeoutFn ?? ((handler, ms) => setTimeout(handler, ms) as unknown as number);
  const cancelTimeout = options.clearTimeoutFn ?? ((id) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>));

  let latestSnapshot: readonly TElement[] = [];
  let lastObservedSceneVersion: number | null = null;
  let lastSettledSceneVersion: number | null = null;
  let timerId: number | null = null;

  function onChange(activeElements: readonly TElement[]): void {
    latestSnapshot = activeElements;
    const currentSceneVersion = options.getSceneVersion(activeElements);

    if (lastObservedSceneVersion === null) {
      // Lazily initialize both values to the same current revision so the
      // first observation never creates a spurious pending difference.
      lastObservedSceneVersion = currentSceneVersion;
      lastSettledSceneVersion = currentSceneVersion;
      return;
    }

    if (currentSceneVersion === lastObservedSceneVersion) {
      // Unchanged-revision traffic: do not schedule, clear, or reset.
      return;
    }

    lastObservedSceneVersion = currentSceneVersion;
    if (timerId !== null) {
      cancelTimeout(timerId);
    }
    timerId = scheduleTimeout(() => {
      timerId = null;
      if (lastObservedSceneVersion !== lastSettledSceneVersion) {
        options.onSettle(latestSnapshot);
        lastSettledSceneVersion = lastObservedSceneVersion;
      }
    }, debounceMs);
  }

  function cleanup(): void {
    if (timerId !== null) {
      cancelTimeout(timerId);
      timerId = null;
    }
  }

  return { onChange, cleanup };
}
