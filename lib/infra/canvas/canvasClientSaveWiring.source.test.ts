// PATCH-337. CanvasClient is too provider-heavy to mount in a unit test, so
// this is a SOURCE/WIRING test: it pins the shape of the save path the patch
// introduced (per-post debounce, flush-before-read, immediate awaited scheduler
// save, non-silent failures). The behavioural proof of the debounce itself
// lives in lib/infra/keyedDebounce.test.ts, and of the split order in
// components/canvas/StandaloneSchedulerCanvas.eventClick.behavior.test.tsx.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  path.join(process.cwd(), 'app/dashboard/canvas/[id]/CanvasClient.tsx'),
  'utf8',
);

function between(start: string, end: string): string {
  const from = source.indexOf(start);
  expect(from, `missing "${start}"`).toBeGreaterThan(-1);
  const to = source.indexOf(end, from);
  expect(to, `missing "${end}" after "${start}"`).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('PATCH-337: CanvasClient save wiring', () => {
  it('uses the per-post keyed debounce, not the shared single-timer debounce', () => {
    expect(source).toContain("import { createKeyedDebounce } from '@/lib/infra/keyedDebounce';");
    expect(source).toContain('createKeyedDebounce<any>(');
    // The old shared debounce import is gone from this file.
    expect(source).not.toMatch(/import \{[^}]*\bdebounce\b[^}]*\} from '@\/components\/collabboard\/canvas\/engine\/utils'/);
  });

  it('flushes pending saves before every read', () => {
    const wrapper = between('const fetchData = useCallback', 'flushPendingPadletMeta]);');
    expect(wrapper.indexOf('await flushPendingPadletMeta();')).toBeGreaterThan(-1);
    expect(wrapper.indexOf('await flushPendingPadletMeta();')).toBeLessThan(wrapper.indexOf('fetchDataRaw(showLoading)'));
  });

  it('the immediate scheduler save cancels the pending debounced save first', () => {
    const now = between('const updatePadletMetadataNow = async', 'if (!saved) await fetchData();');
    const cancelAt = now.indexOf('padletMetaSaver.cancel(padletId);');
    const writeAt = now.indexOf('await savePadletMetaNow(padletId, newMetadata);');
    expect(cancelAt).toBeGreaterThan(-1);
    expect(writeAt).toBeGreaterThan(cancelAt);
    expect(source).toContain('onUpdatePadletMetadata={updatePadletMetadataNow}');
  });

  it('flushes on pagehide, tab-hide and unmount', () => {
    expect(source).toContain("window.addEventListener('pagehide', flush);");
    expect(source).toContain("document.addEventListener('visibilitychange', onVisibility);");
    expect(source).toContain("if (document.visibilityState === 'hidden') flush();");
  });

  it('reports a failed write instead of swallowing it', () => {
    expect(source).toContain("console.error('Failed to save post metadata:', padletId);");
    expect(source).toContain('showSaveFailureToast');
    expect(source).toContain("toast.error(\"Couldn't save your change. Check your connection and try again.\")");
    // At most one failure toast per 10 s.
    expect(source).toMatch(/now - lastSaveFailureToastRef\.current < 10_000/);
  });

  it('treats a RETURNED { ok: false } as a failed save (the command never throws)', () => {
    const save = between('const savePadletMetaNow = useCallback', 'showSaveFailureToast]);');
    expect(save).toContain('const result = await updatePostMetadata(');
    const failAt = save.indexOf('if (!result.ok)');
    expect(failAt).toBeGreaterThan(-1);
    const branch = save.slice(failAt, save.indexOf('return true;', failAt));
    expect(branch).toContain('showSaveFailureToast();');
    expect(branch).toContain('return false;');
  });

  it('the immediate scheduler save re-reads the board when the save reports failure', () => {
    const now = between('const updatePadletMetadataNow = async', 'if (!saved) await fetchData();');
    expect(now).toContain('const saved = await savePadletMetaNow(padletId, newMetadata);');
    expect(source).toContain('if (!saved) await fetchData();');
  });
});
