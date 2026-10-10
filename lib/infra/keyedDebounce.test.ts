import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createKeyedDebounce } from './keyedDebounce';

describe('PATCH-337 createKeyedDebounce', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('writes two different keys queued within the delay', () => {
    const write = vi.fn();
    const d = createKeyedDebounce<string>(write, 100);
    d.schedule('a', 'A');
    d.schedule('b', 'B');
    vi.advanceTimersByTime(100);
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenCalledWith('a', 'A');
    expect(write).toHaveBeenCalledWith('b', 'B');
  });

  it('keeps only the latest value for the same key', () => {
    const write = vi.fn();
    const d = createKeyedDebounce<string>(write, 100);
    d.schedule('a', 'first');
    d.schedule('a', 'second');
    vi.advanceTimersByTime(100);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('a', 'second');
  });

  it('flush writes pending values at once and resolves after the writes', async () => {
    const written: string[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const write = vi.fn((_key: string, value: string) => { written.push(value); return gate; });
    const d = createKeyedDebounce<string>(write, 100);
    d.schedule('a', 'A');
    d.schedule('b', 'B');

    let flushed = false;
    const flushPromise = d.flush().then(() => { flushed = true; });
    expect(write).toHaveBeenCalledTimes(2);
    expect(flushed).toBe(false);

    release();
    await flushPromise;
    expect(flushed).toBe(true);
    expect(written).toEqual(['A', 'B']);
  });

  it('cancel drops only the named key', () => {
    const write = vi.fn();
    const d = createKeyedDebounce<string>(write, 100);
    d.schedule('a', 'A');
    d.schedule('b', 'B');
    d.cancel('a');
    vi.advanceTimersByTime(100);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('b', 'B');
  });
});
