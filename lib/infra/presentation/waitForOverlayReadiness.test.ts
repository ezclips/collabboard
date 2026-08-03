import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitForOverlayReadiness, type ExpectedSlideOverlay } from "@/components/presentation/slide-renderer/waitForOverlayReadiness";

const expected: ExpectedSlideOverlay[] = [{ id: "overlay-a", localX: 10, localY: 20, width: 160, height: 90 }];
let observers: Array<() => void> = [];

class FakeElement {
  children: FakeElement[] = [];
  attrs: Record<string, string> = {};
  listeners: Record<string, Array<() => void>> = {};
  complete = true;
  naturalWidth = 1;
  decode?: () => Promise<void>;

  constructor(public tagName = "div", public rect = { left: 0, top: 0, width: 0, height: 0 }) {}
  appendChild(child: FakeElement) { this.children.push(child); notify(); return child; }
  replaceChildren(...children: FakeElement[]) { this.children = children; notify(); }
  setAttribute(name: string, value: string) { this.attrs[name] = value; notify(); }
  getBoundingClientRect() { return { ...this.rect, right: this.rect.left + this.rect.width, bottom: this.rect.top + this.rect.height }; }
  addEventListener(type: string, listener: () => void) { this.listeners[type] = [...(this.listeners[type] ?? []), listener]; }
  removeEventListener(type: string, listener: () => void) { this.listeners[type] = (this.listeners[type] ?? []).filter((entry) => entry !== listener); }
  dispatch(type: string) { for (const listener of this.listeners[type] ?? []) listener(); }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector: string): FakeElement[] {
    const all = this.children.flatMap((child) => [child, ...child.querySelectorAll(selector)]);
    if (selector === "img") return all.filter((node) => node.tagName === "img");
    if (selector.includes("data-slide-overlay-id")) {
      const id = selector.match(/"([^"]+)"/)?.[1];
      return all.filter((node) => node.attrs["data-slide-overlay-id"] === id);
    }
    if (selector.includes("data-ai-render-state")) {
      return all.filter((node) => node.attrs["data-ai-render-state"] === "loading" || node.attrs["data-ai-image-state"] === "loading");
    }
    return [];
  }
}

function notify() {
  queueMicrotask(() => observers.forEach((callback) => callback()));
}

function installBrowserStubs() {
  observers = [];
  vi.stubGlobal("CSS", { escape: (value: string) => value });
  vi.stubGlobal("document", { fonts: { ready: Promise.resolve() } });
  vi.stubGlobal("window", {
    requestAnimationFrame: (callback: FrameRequestCallback) => { queueMicrotask(() => callback(performance.now())); return 1; },
    cancelAnimationFrame: () => undefined,
  });
  vi.stubGlobal("MutationObserver", class {
    constructor(private callback: () => void) {}
    observe() { observers.push(this.callback); }
    disconnect() { observers = observers.filter((entry) => entry !== this.callback); }
  });
}

function hostWithOverlay() {
  const host = new FakeElement("div", { left: 100, top: 50, width: 640, height: 360 });
  const overlay = new FakeElement("div", { left: 110, top: 70, width: 160, height: 90 });
  overlay.setAttribute("data-slide-overlay-id", "overlay-a");
  host.appendChild(overlay);
  return { host, overlay };
}

async function expectAbort(promise: Promise<void>, controller: AbortController) {
  controller.abort();
  await expect(promise).rejects.toMatchObject({ name: "AbortError" });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  installBrowserStubs();
});

describe("waitForOverlayReadiness", () => {
  it("does not resolve while an expected overlay is missing", async () => {
    const controller = new AbortController();
    await expectAbort(waitForOverlayReadiness(new FakeElement() as unknown as HTMLElement, expected, controller.signal), controller);
  });

  it("does not resolve for zero-size or mismatched geometry", async () => {
    const { host, overlay } = hostWithOverlay();
    overlay.rect = { left: 110, top: 70, width: 0, height: 90 };
    const controller = new AbortController();
    await expectAbort(waitForOverlayReadiness(host as unknown as HTMLElement, expected, controller.signal), controller);

    overlay.rect = { left: 140, top: 70, width: 160, height: 90 };
    const controller2 = new AbortController();
    await expectAbort(waitForOverlayReadiness(host as unknown as HTMLElement, expected, controller2.signal), controller2);
  });

  it("waits for loading-state descendants and observes nodes mounted after start", async () => {
    const host = new FakeElement("div", { left: 0, top: 0, width: 640, height: 360 });
    let resolved = false;
    const promise = waitForOverlayReadiness(host as unknown as HTMLElement, expected).then(() => { resolved = true; });
    await Promise.resolve();
    expect(resolved).toBe(false);

    const overlay = new FakeElement("div", { left: 10, top: 20, width: 160, height: 90 });
    const child = new FakeElement();
    overlay.setAttribute("data-slide-overlay-id", "overlay-a");
    child.setAttribute("data-ai-render-state", "loading");
    overlay.appendChild(child);
    host.appendChild(overlay);
    await Promise.resolve();
    expect(resolved).toBe(false);

    child.setAttribute("data-ai-render-state", "done");
    await promise;
    expect(resolved).toBe(true);
  });

  it("waits for image decode success and accepts terminal failure fallback", async () => {
    const { host, overlay } = hostWithOverlay();
    const image = new FakeElement("img") as FakeElement & HTMLImageElement;
    image.complete = false;
    image.naturalWidth = 0;
    image.decode = vi.fn().mockResolvedValue(undefined);
    overlay.appendChild(image);
    const promise = waitForOverlayReadiness(host as unknown as HTMLElement, expected);
    await Promise.resolve();
    image.dispatch("load");
    await promise;

    const failed = new FakeElement("img") as FakeElement & HTMLImageElement;
    failed.complete = true;
    failed.naturalWidth = 0;
    overlay.replaceChildren(failed);
    await expect(waitForOverlayReadiness(host as unknown as HTMLElement, expected)).resolves.toBeUndefined();
  });

  it("awaits fonts and the final double requestAnimationFrame", async () => {
    const { host } = hostWithOverlay();
    let releaseFonts!: () => void;
    vi.stubGlobal("document", { fonts: { ready: new Promise<void>((resolve) => { releaseFonts = resolve; }) } });
    let frames = 0;
    vi.stubGlobal("window", {
      requestAnimationFrame: (callback: FrameRequestCallback) => { frames += 1; queueMicrotask(() => callback(performance.now())); return frames; },
      cancelAnimationFrame: () => undefined,
    });
    const promise = waitForOverlayReadiness(host as unknown as HTMLElement, expected);
    await Promise.resolve();
    expect(frames).toBe(0);
    releaseFonts();
    await promise;
    expect(frames).toBe(2);
  });
});
