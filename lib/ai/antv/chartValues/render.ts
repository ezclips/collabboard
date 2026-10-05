/**
 * PATCH-287. The one copy of the AntV → elements render used by the library
 * export and the redraw. It creates a container when none is given
 * (off-screen), always destroys the AntV instance, and always removes the
 * container it created — on success and on failure.
 */

import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';

import { loadAntv } from '../load';
import { toAntvOptions } from '../mapOutline';
import { convertAntvSvg } from '../toExcalidraw';
import type { VisualOutline } from '@/lib/ai/outline';
import { themeById, type VisualThemeId } from '@/lib/ai/visualThemes';

interface AntvInstance {
  on?: (event: string, callback: (...args: unknown[]) => void) => void;
  render?: () => void;
  destroy?: () => void;
}

/** Addendum 1, item 8. A render that never fires `loaded`/`error` is abandoned. */
const RENDER_TIMEOUT_MS = 20000;

export interface RenderAntvInput {
  template: string;
  theme: string;
  outline: VisualOutline;
  /** Reuse an existing container; when omitted an off-screen one is created. */
  container?: HTMLElement | null;
}

export interface RenderAntvResult {
  elements: ExcalidrawElement[];
}

function offscreenContainer(): HTMLDivElement {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-100000px';
  container.style.top = '0';
  container.style.width = '720px';
  container.style.opacity = '0';
  container.style.pointerEvents = 'none';
  document.body.appendChild(container);
  return container;
}

/**
 * Render `outline` through the AntV template and convert it to Excalidraw
 * elements with roles assigned. Uses `icons: 'strokes'`, `pill: 'polygon'` and
 * the theme's background, exactly like the drawing-library export.
 */
export async function renderAntvToElements(input: RenderAntvInput): Promise<RenderAntvResult> {
  const mod = await loadAntv();
  const Ctor = mod.Infographic as unknown as new (
    options: Record<string, unknown>,
  ) => AntvInstance;
  const background = themeById(input.theme).background;
  const owned = !input.container;
  const container = input.container ?? offscreenContainer();

  try {
    const elements = await new Promise<ExcalidrawElement[]>((resolve, reject) => {
      const ig = new Ctor({
        ...toAntvOptions(input.outline, input.template, input.theme as VisualThemeId),
        container,
        width: '100%',
        height: 'auto',
        editable: false,
      });
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const destroy = () => {
        try {
          ig.destroy?.();
        } catch {
          // destroying a half-rendered instance must not mask the real error
        }
      };
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        destroy();
        reject(error);
      };
      ig.on?.('error', () => fail(new Error(`AntV render failed: ${input.template}`)));
      ig.on?.('loaded', () => {
        if (settled) return;
        const svg = container.querySelector('svg');
        if (!svg) {
          fail(new Error(`AntV produced no <svg>: ${input.template}`));
          return;
        }
        convertAntvSvg(svg, {
          background,
          template: input.template,
          theme: input.theme,
          pill: 'polygon',
          icons: 'strokes',
          roles: true,
        })
          .then((result) => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            destroy();
            resolve(result.elements);
          })
          .catch((cause: unknown) =>
            fail(cause instanceof Error ? cause : new Error(String(cause))),
          );
      });
      timer = setTimeout(() => fail(new Error('AntV render timed out')), RENDER_TIMEOUT_MS);
      try {
        ig.render?.();
      } catch (cause: unknown) {
        fail(cause instanceof Error ? cause : new Error(String(cause)));
      }
    });
    return { elements };
  } finally {
    if (owned) container.remove();
  }
}
