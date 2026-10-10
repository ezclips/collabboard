/**
 * A keyed debounce: one pending call per key, so scheduling a call for one key
 * never cancels a pending call for another. The canvas's old single-timer
 * `debounce` (components/collabboard/canvas/engine/utils.ts) shared one timer
 * across every post, so a metadata save for post B within the delay silently
 * dropped a pending save for post A. No React, no DOM.
 */

export type KeyedWriter<T> = (key: string, value: T) => void | Promise<void>;

export interface KeyedDebounce<T> {
  /** Queue `value` for `key`, resetting that key's timer (latest wins). */
  schedule(key: string, value: T): void;
  /** Drop any pending value for `key` without writing it. Other keys stay. */
  cancel(key: string): void;
  /** Write every pending value now; resolves once all writes have settled. */
  flush(): Promise<void>;
}

export function createKeyedDebounce<T>(
  write: KeyedWriter<T>,
  delayMs: number,
): KeyedDebounce<T> {
  const pending = new Map<string, { value: T; timer: ReturnType<typeof setTimeout> }>();
  const inflight = new Set<Promise<void>>();

  const start = (key: string, value: T): void => {
    let result: void | Promise<void>;
    try {
      result = write(key, value);
    } catch {
      // The writer reports its own failure; a synchronous throw must not escape.
      return;
    }
    const settled = Promise.resolve(result).then(
      () => undefined,
      () => undefined,
    );
    inflight.add(settled);
    void settled.then(() => { inflight.delete(settled); });
  };

  return {
    schedule(key, value) {
      const existing = pending.get(key);
      if (existing) clearTimeout(existing.timer);
      const timer = setTimeout(() => {
        pending.delete(key);
        start(key, value);
      }, delayMs);
      pending.set(key, { value, timer });
    },

    cancel(key) {
      const existing = pending.get(key);
      if (!existing) return;
      clearTimeout(existing.timer);
      pending.delete(key);
    },

    async flush() {
      for (const [key, entry] of Array.from(pending.entries())) {
        clearTimeout(entry.timer);
        pending.delete(key);
        start(key, entry.value);
      }
      while (inflight.size > 0) {
        await Promise.all(Array.from(inflight));
      }
    },
  };
}
