'use client';

import React, { useEffect, useRef, useState } from 'react';

import type { InfographicDiagramData } from '@/lib/ai/contracts';
import { applyAntvChange, toAntvOptions, type AntvChangeEvent } from '@/lib/ai/antv/mapOutline';
import type { VisualOutline } from '@/lib/ai/outline';
import { themeById } from '@/lib/ai/visualThemes';

/**
 * PATCH-241. Draws a stored outline with the bundled AntV Infographic engine.
 * The engine is loaded only here, only on the client, and only when a picture is
 * shown; our setup (`loadAntv`) turns its fonts off and feeds it our icons, so a
 * picture makes no outside requests. With `edit`, AntV's own on-picture editing
 * is enabled and every `options:change` is mapped back to a new outline.
 */

type RenderPhase = 'loading' | 'done' | 'failed';

interface AntvInstance {
  render(): void;
  update(options: unknown): void;
  on(event: string, listener: (payload: unknown) => void): void;
  destroy(): void;
}

function AntvInfographicRenderer({
  data,
  edit,
  initialEditRef: _initialEditRef,
}: {
  data: InfographicDiagramData;
  edit?: { onChange: (next: VisualOutline) => void };
  initialEditRef?: string | null;
}) {
  const theme = themeById(data.theme);
  const templateName = data.template.slice('antv:'.length);
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<AntvInstance | null>(null);
  const [phase, setPhase] = useState<RenderPhase>('loading');

  // Keep the current outline/callback in refs so the create effect can stay
  // keyed on the template/theme and StrictMode's double-run is harmless.
  const outlineRef = useRef(data.outline);
  outlineRef.current = data.outline;
  const editRef = useRef(edit);
  editRef.current = edit;

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    setPhase('loading');
    let instance: AntvInstance | null = null;

    // The adapter (setup + our icons) is itself lazy: it joins the engine chunk
    // instead of the main bundle, and only for a page that shows a picture.
    import('@/lib/ai/antv/load')
      .then(({ loadAntv }) => loadAntv())
      .then((mod) => {
        if (cancelled) return;
        container.innerHTML = '';
        instance = new mod.Infographic({
          container,
          width: '100%',
          height: 'auto',
          editable: Boolean(editRef.current),
          ...toAntvOptions(outlineRef.current, templateName, data.theme),
        }) as unknown as AntvInstance;
        instance.on('error', () => {
          if (!cancelled) setPhase('failed');
        });
        instance.on('loaded', () => {
          if (!cancelled) setPhase('done');
        });
        if (editRef.current) {
          instance.on('options:change', (event) => {
            editRef.current?.onChange(
              applyAntvChange(outlineRef.current, templateName, event as AntvChangeEvent),
            );
          });
        }
        instanceRef.current = instance;
        instance.render();
      })
      .catch(() => {
        if (!cancelled) setPhase('failed');
      });

    return () => {
      cancelled = true;
      instance?.destroy();
      if (instanceRef.current === instance) instanceRef.current = null;
    };
    // Re-created only when the engine input changes; the outline edits go through
    // `update` below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateName, data.theme, Boolean(edit)]);

  // Outline changes (an edit committed to our data) re-render through update().
  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    instance.update(toAntvOptions(data.outline, templateName, data.theme));
  }, [data.outline, templateName, data.theme]);

  return (
    <div
      data-ai-theme-background={theme.id}
      data-ai-render-state={phase}
      className="h-full w-full overflow-auto rounded-2xl border border-black/10 p-5 shadow-sm"
      style={{ backgroundColor: theme.background }}
    >
      <div className="space-y-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: theme.muted }}>
            infographic
          </div>
          {/* The title is NOT printed here: AntV draws `data.title` inside the
              picture, and that is the one shown and edited on the picture. */}
          {data.explanation && <p className="mt-2 text-sm" style={{ color: theme.text }}>{data.explanation}</p>}
        </div>
        {phase === 'loading' && (
          <div className="flex min-h-[300px] items-center justify-center text-sm text-gray-400">
            Rendering picture…
          </div>
        )}
        {phase === 'failed' && (
          <div className="flex min-h-[120px] items-center justify-center text-sm text-gray-400">
            This picture could not be drawn.
          </div>
        )}
        <div ref={containerRef} data-antv-container={templateName} className="w-full" />
      </div>
    </div>
  );
}

export default AntvInfographicRenderer;
