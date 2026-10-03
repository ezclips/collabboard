'use client';

import { useCallback, useMemo, useState } from 'react';

import type { AIContentData } from '@/lib/ai/contracts';
import { normalizeAIContent } from '@/lib/ai/normalize-ai-content';
import { serializeAIContentForPersistence } from '@/lib/ai/persistence';
import type { DiagramKickerEditContextValue } from './DiagramKicker';

/**
 * PATCH-264. The state behind the diagram type label ("MINDMAP", ...). The two
 * big editor files wire only this hook in; it owns the value, hands the renderers
 * a context value, and stamps the value onto the data that is previewed/saved.
 */
export interface DiagramKickerController {
  kicker: string | undefined;
  onChange: (next: string | undefined) => void;
  /** Stable provider value for `DiagramKickerEditContext`. */
  contextValue: DiagramKickerEditContextValue;
  /** Returns a copy of the diagram data carrying the current kicker. */
  applyKicker: <T extends object>(data: T) => T;
  /** Re-reads the value when the editor opens fresh. */
  reset: (initial: string | undefined) => void;
}

export function useDiagramKicker(initial: string | undefined): DiagramKickerController {
  const [kicker, setKicker] = useState<string | undefined>(initial);

  const onChange = useCallback((next: string | undefined) => setKicker(next), []);
  const reset = useCallback((next: string | undefined) => setKicker(next), []);
  const applyKicker = useCallback(
    <T extends object>(data: T): T => ({ ...data, kicker }),
    [kicker],
  );
  const contextValue = useMemo(() => ({ onChange }), [onChange]);

  return useMemo(
    () => ({ kicker, onChange, contextValue, applyKicker, reset }),
    [kicker, onChange, contextValue, applyKicker, reset],
  );
}

/** The kicker stored on a diagram envelope, if the content is a diagram. */
export function readDiagramKicker(content: unknown): string | undefined {
  if (content === undefined || content === null) return undefined;
  const normalized = normalizeAIContent(content);
  if (normalized.kind !== 'structured') return undefined;
  const data = normalized.envelope?.data ?? normalized.data;
  return data.type === 'diagram' ? data.kicker : undefined;
}

/**
 * Stamps the kicker onto a diagram envelope, keeping the original mode/meta.
 * Non-diagram content (and legacy HTML) is returned unchanged.
 */
export function applyKickerToContent(content: unknown, kicker: string | undefined): unknown {
  if (content === undefined || content === null) return content;
  const normalized = normalizeAIContent(content);
  if (normalized.kind !== 'structured' || normalized.data.type !== 'diagram') return content;

  const withKicker: AIContentData = { ...normalized.data, kicker };
  return serializeAIContentForPersistence(withKicker, {
    mode: normalized.envelope?.mode ?? 'diagram',
    meta: normalized.envelope?.meta,
  }) ?? content;
}
