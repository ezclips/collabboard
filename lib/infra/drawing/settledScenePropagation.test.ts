import { describe, expect, it, vi } from "vitest";
import { createSettledScenePropagation } from "./settledScenePropagation";

type FakeElement = { id: string; version: number };

function makeFakeTimers() {
  const pending = new Map<number, () => void>();
  let nextId = 1;
  const setTimeoutFn = (handler: () => void) => {
    const id = nextId++;
    pending.set(id, handler);
    return id;
  };
  const clearTimeoutFn = (id: number) => {
    pending.delete(id);
  };
  const fire = (id: number) => {
    const handler = pending.get(id);
    if (!handler) throw new Error(`no pending timer with id ${id}`);
    pending.delete(id);
    handler();
  };
  const pendingIds = () => [...pending.keys()];
  return { setTimeoutFn, clearTimeoutFn, fire, pendingIds };
}

function sceneVersion(elements: readonly FakeElement[]): number {
  return elements.reduce((sum, el) => sum + el.version, 0);
}

describe("createSettledScenePropagation", () => {
  it("does not propagate on the first (initializing) observation", () => {
    const onSettle = vi.fn();
    const timers = makeFakeTimers();
    const propagation = createSettledScenePropagation<FakeElement>({
      getSceneVersion: sceneVersion,
      onSettle,
      setTimeoutFn: timers.setTimeoutFn,
      clearTimeoutFn: timers.clearTimeoutFn,
    });

    propagation.onChange([{ id: "a", version: 1 }]);

    expect(onSettle).not.toHaveBeenCalled();
    expect(timers.pendingIds()).toHaveLength(0);
  });

  it("schedules once when the observed revision actually changes", () => {
    const onSettle = vi.fn();
    const timers = makeFakeTimers();
    const propagation = createSettledScenePropagation<FakeElement>({
      getSceneVersion: sceneVersion,
      onSettle,
      setTimeoutFn: timers.setTimeoutFn,
      clearTimeoutFn: timers.clearTimeoutFn,
    });

    propagation.onChange([{ id: "a", version: 1 }]); // init
    propagation.onChange([{ id: "a", version: 2 }]); // real change

    expect(timers.pendingIds()).toHaveLength(1);
    expect(onSettle).not.toHaveBeenCalled();
  });

  it("does not reschedule or clear on unchanged-revision traffic", () => {
    const onSettle = vi.fn();
    const timers = makeFakeTimers();
    const propagation = createSettledScenePropagation<FakeElement>({
      getSceneVersion: sceneVersion,
      onSettle,
      setTimeoutFn: timers.setTimeoutFn,
      clearTimeoutFn: timers.clearTimeoutFn,
    });

    propagation.onChange([{ id: "a", version: 1 }]); // init
    propagation.onChange([{ id: "a", version: 2 }]); // real change, schedules
    const scheduledId = timers.pendingIds()[0];

    // Many no-op calls with the same revision.
    for (let i = 0; i < 50; i++) {
      propagation.onChange([{ id: "a", version: 2 }]);
    }

    expect(timers.pendingIds()).toEqual([scheduledId]);
    expect(onSettle).not.toHaveBeenCalled();
  });

  it("settles once via the callback, propagating the latest snapshot", () => {
    const onSettle = vi.fn();
    const timers = makeFakeTimers();
    const propagation = createSettledScenePropagation<FakeElement>({
      getSceneVersion: sceneVersion,
      onSettle,
      setTimeoutFn: timers.setTimeoutFn,
      clearTimeoutFn: timers.clearTimeoutFn,
    });

    propagation.onChange([{ id: "a", version: 1 }]); // init
    propagation.onChange([{ id: "a", version: 2 }]);
    const snapshot = [{ id: "a", version: 2 }];
    propagation.onChange(snapshot);
    const [id] = timers.pendingIds();
    timers.fire(id);

    expect(onSettle).toHaveBeenCalledTimes(1);
    expect(onSettle).toHaveBeenCalledWith(snapshot);
  });

  it("collapses many rapid revision changes into one settled call", () => {
    const onSettle = vi.fn();
    const timers = makeFakeTimers();
    const propagation = createSettledScenePropagation<FakeElement>({
      getSceneVersion: sceneVersion,
      onSettle,
      setTimeoutFn: timers.setTimeoutFn,
      clearTimeoutFn: timers.clearTimeoutFn,
    });

    propagation.onChange([{ id: "a", version: 1 }]); // init
    for (let v = 2; v <= 17; v++) {
      propagation.onChange([{ id: "a", version: v }]);
      // Reschedule cancels the previous pending timer -- only one remains.
      expect(timers.pendingIds()).toHaveLength(1);
    }

    const [id] = timers.pendingIds();
    timers.fire(id);

    expect(onSettle).toHaveBeenCalledTimes(1);
    expect(onSettle).toHaveBeenCalledWith([{ id: "a", version: 17 }]);
  });

  it("keeps observed and settled distinct until the callback completes", () => {
    // Regression test for the PATCH-128 one-ref defect: scheduling a second real
    // change before the first settles must not get silently absorbed.
    const onSettle = vi.fn();
    const timers = makeFakeTimers();
    const propagation = createSettledScenePropagation<FakeElement>({
      getSceneVersion: sceneVersion,
      onSettle,
      setTimeoutFn: timers.setTimeoutFn,
      clearTimeoutFn: timers.clearTimeoutFn,
    });

    propagation.onChange([{ id: "a", version: 1 }]); // init
    propagation.onChange([{ id: "a", version: 2 }]); // schedules
    const [firstTimerId] = timers.pendingIds();
    timers.fire(firstTimerId); // settles at 2
    expect(onSettle).toHaveBeenCalledTimes(1);

    propagation.onChange([{ id: "a", version: 3 }]); // a second real change after settling
    expect(timers.pendingIds()).toHaveLength(1);
    const [secondTimerId] = timers.pendingIds();
    timers.fire(secondTimerId);

    expect(onSettle).toHaveBeenCalledTimes(2);
    expect(onSettle).toHaveBeenNthCalledWith(2, [{ id: "a", version: 3 }]);
  });

  it("cleanup cancels pending work", () => {
    const onSettle = vi.fn();
    const timers = makeFakeTimers();
    const propagation = createSettledScenePropagation<FakeElement>({
      getSceneVersion: sceneVersion,
      onSettle,
      setTimeoutFn: timers.setTimeoutFn,
      clearTimeoutFn: timers.clearTimeoutFn,
    });

    propagation.onChange([{ id: "a", version: 1 }]); // init
    propagation.onChange([{ id: "a", version: 2 }]); // schedules
    expect(timers.pendingIds()).toHaveLength(1);

    propagation.cleanup();

    expect(timers.pendingIds()).toHaveLength(0);
  });
});
