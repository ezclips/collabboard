export type ExpectedSlideOverlay = { id: string; localX: number; localY: number; width: number; height: number };

const LOADING_SELECTOR = '[data-ai-render-state="loading"], [data-ai-image-state="loading"]';
const TOLERANCE_PX = 1.5;
const abortError = () => Object.assign(new Error("Overlay readiness aborted"), { name: "AbortError" });
const checkAbort = (signal?: AbortSignal) => { if (signal?.aborted) throw abortError(); };
const escapeId = (value: string) => (
  typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(value) : value.replace(/["\\]/g, "\\$&")
);

function frame(signal?: AbortSignal): Promise<void> {
  checkAbort(signal);
  return new Promise((resolve, reject) => {
    const onAbort = () => { window.cancelAnimationFrame(id); reject(abortError()); };
    const id = window.requestAnimationFrame(() => {
      signal?.removeEventListener("abort", onAbort);
      try { checkAbort(signal); resolve(); } catch (error) { reject(error); }
    });
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function imageReady(image: HTMLImageElement, signal?: AbortSignal): Promise<void> {
  checkAbort(signal);
  if (image.complete) {
    if (image.naturalWidth === 0) return Promise.resolve();
    return typeof image.decode === "function" ? image.decode().catch(() => undefined) : Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      image.removeEventListener("load", onLoad);
      image.removeEventListener("error", done);
      signal?.removeEventListener("abort", onAbort);
    };
    const done = () => { cleanup(); resolve(); };
    const onLoad = () => { if (typeof image.decode === "function") image.decode().then(done).catch(done); else done(); };
    const onAbort = () => { cleanup(); reject(abortError()); };
    image.addEventListener("load", onLoad, { once: true });
    image.addEventListener("error", done, { once: true });
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function readyNodes(host: HTMLElement, expected: readonly ExpectedSlideOverlay[]): HTMLElement[] | null {
  const hostRect = host.getBoundingClientRect();
  const nodes: HTMLElement[] = [];
  for (const overlay of expected) {
    const matches = Array.from(host.querySelectorAll<HTMLElement>(`[data-slide-overlay-id="${escapeId(overlay.id)}"]`));
    if (matches.length !== 1) return null;
    const node = matches[0]!;
    const rect = node.getBoundingClientRect();
    if (
      rect.width <= 0
      || rect.height <= 0
      || Math.abs(rect.left - hostRect.left - overlay.localX) > TOLERANCE_PX
      || Math.abs(rect.top - hostRect.top - overlay.localY) > TOLERANCE_PX
      || Math.abs(rect.width - overlay.width) > TOLERANCE_PX
      || Math.abs(rect.height - overlay.height) > TOLERANCE_PX
      || node.querySelector(LOADING_SELECTOR)
    ) return null;
    nodes.push(node);
  }
  return nodes;
}

function waitForNodes(host: HTMLElement, expected: readonly ExpectedSlideOverlay[], signal?: AbortSignal): Promise<HTMLElement[]> {
  let observer: MutationObserver | null = null;
  return new Promise((resolve, reject) => {
    const cleanup = () => { observer?.disconnect(); signal?.removeEventListener("abort", onAbort); };
    const onAbort = () => { cleanup(); reject(abortError()); };
    const evaluate = () => {
      try {
        checkAbort(signal);
        const result = readyNodes(host, expected);
        if (result) { cleanup(); resolve(result); }
      } catch (error) { cleanup(); reject(error); }
    };
    observer = new MutationObserver(evaluate);
    observer.observe(host, { attributes: true, childList: true, subtree: true });
    signal?.addEventListener("abort", onAbort, { once: true });
    evaluate();
  });
}

export async function waitForOverlayReadiness(host: HTMLElement, expected: readonly ExpectedSlideOverlay[], signal?: AbortSignal): Promise<void> {
  const nodes = await waitForNodes(host, expected, signal);
  await Promise.all(nodes.flatMap((node) => Array.from(node.querySelectorAll("img")).map((img) => imageReady(img, signal))));
  checkAbort(signal);
  const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
  if (fonts?.ready) await fonts.ready;
  await frame(signal);
  await frame(signal);
  checkAbort(signal);
}
