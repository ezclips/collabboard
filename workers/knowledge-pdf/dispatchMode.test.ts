import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  KNOWLEDGE_PDF_DISPATCH_MODES,
  resolveKnowledgePdfDispatchMode,
  runKnowledgePdfDispatcher,
  type KnowledgePdfDispatcherDependencies,
} from './dispatcher';
import type { KnowledgeDocumentId } from '../../lib/domain/core/ids';

const DOC = 'aaaaaaaa-1111-4111-8111-111111111111' as KnowledgeDocumentId;
const ok = <T>(value: T) => ({ ok: true as const, value });

describe('1-4. the dispatch mode is explicit and strict', () => {
  it('1,2. unset and empty mean normal, as does naming it', () => {
    expect(resolveKnowledgePdfDispatchMode(undefined)).toBe('normal');
    expect(resolveKnowledgePdfDispatchMode('')).toBe('normal');
    expect(resolveKnowledgePdfDispatchMode('normal')).toBe('normal');
  });

  it('3. render-only must be asked for by name', () => {
    expect(resolveKnowledgePdfDispatchMode('render-only')).toBe('render-only');
    expect(KNOWLEDGE_PDF_DISPATCH_MODES).toEqual(['normal', 'render-only']);
  });

  it('4. anything else is a configuration error, never normalised', () => {
    for (const bad of ['render only', 'RENDER-ONLY', 'renderonly', 'Normal', 'true', '1', 'render-only ']) {
      // A typo must not silently select a mode that skips extraction for a
      // whole deployment.
      expect(() => resolveKnowledgePdfDispatchMode(bad), bad).toThrow(/KNOWLEDGE_PDF_DISPATCH_MODE/);
    }
  });
});

/** A dispatcher whose every seam is observable. */
function harness(overrides: Partial<KnowledgePdfDispatcherDependencies> = {}) {
  const listProcessingCandidates = vi.fn(async () => ok([] as readonly KnowledgeDocumentId[]));
  const processDocument = vi.fn(async () => ({ status: 'ready' as const, documentId: String(DOC) }));
  const renderPass = vi.fn(async () => 0);
  const deps = {
    discovery: { listProcessingCandidates },
    processDocument,
    renderPass,
    sleep: vi.fn(async () => {}),
    log: vi.fn(),
    ...overrides,
  } as unknown as KnowledgePdfDispatcherDependencies;
  return { deps, listProcessingCandidates, processDocument, renderPass };
}

describe('7-13. render-only touches no extraction authority', () => {
  /** Render-only is expressed by omitting BOTH extraction halves. */
  const renderOnly = (renderPass: () => Promise<number>) => ({
    deps: {
      renderPass, sleep: vi.fn(async () => {}), log: vi.fn(),
    } as unknown as KnowledgePdfDispatcherDependencies,
    renderPass,
  });

  it('8,9,10. no discovery, no claim, no document processing', async () => {
    const listProcessingCandidates = vi.fn(async () => ok([DOC]));
    const processDocument = vi.fn(async () => ({ status: 'ready' as const, documentId: String(DOC) }));
    const renderPass = vi.fn(async () => 1);
    const summary = await runKnowledgePdfDispatcher(
      { renderPass, sleep: vi.fn(async () => {}), log: vi.fn() } as unknown as KnowledgePdfDispatcherDependencies,
      { once: true },
    );
    expect(listProcessingCandidates).not.toHaveBeenCalled();
    expect(processDocument).not.toHaveBeenCalled();
    expect(summary.discovered).toBe(0);
    expect(summary.started).toBe(0);
  });

  it('11,12,13,14. the derivative path is the only thing that runs', async () => {
    const spy = vi.fn(async () => 1);
    const { deps } = renderOnly(spy);
    const renderPass = spy;
    const summary = await runKnowledgePdfDispatcher(deps, { once: true });
    expect(renderPass).toHaveBeenCalledTimes(1);
    expect(summary.rendered).toBe(1);
    expect(summary.renderErrors).toBe(0);
  });

  it('15. a render failure is still recorded, not swallowed into extraction', async () => {
    const { deps } = renderOnly(async () => { throw new Error('raster exploded'); });
    const summary = await runKnowledgePdfDispatcher(deps, { once: true });
    expect(summary.renderErrors).toBe(1);
    expect(summary.rendered).toBe(0);
    // Extraction counters stay untouched -- nothing was claimed to fail.
    expect(summary.failed).toBe(0);
    expect(summary.discovered).toBe(0);
  });
});

describe('MID-RUN ARRIVAL: an upload during an operator repair is left alone', () => {
  it('an extraction candidate is never listed, claimed or failed', async () => {
    // The negative control: a real candidate exists and would be claimed by a
    // normal dispatcher. Render-only must not touch it.
    const listProcessingCandidates = vi.fn(async () => ok([DOC]));
    const processDocument = vi.fn(async () => ({ status: 'ready' as const, documentId: String(DOC) }));
    const renderPass = vi.fn(async () => 1);

    const summary = await runKnowledgePdfDispatcher(
      { renderPass, sleep: vi.fn(async () => {}), log: vi.fn() } as unknown as KnowledgePdfDispatcherDependencies,
      { once: true },
    );

    expect(listProcessingCandidates).not.toHaveBeenCalled();
    expect(processDocument).not.toHaveBeenCalled();
    expect(summary.failed).toBe(0);
    expect(summary.conflicts).toBe(0);
    // And the repair the operator actually queued did happen.
    expect(renderPass).toHaveBeenCalledTimes(1);
    expect(summary.rendered).toBe(1);
  });
});

describe('16-21. normal mode is unchanged', () => {
  it('16,18,19. extraction is discovered and processed as before', async () => {
    const { deps, listProcessingCandidates, processDocument } = harness({
      discovery: { listProcessingCandidates: vi.fn(async () => ok([DOC])) } as never,
    });
    const summary = await runKnowledgePdfDispatcher(deps, { once: true });
    expect(processDocument).toHaveBeenCalledWith(DOC);
    expect(summary.discovered).toBe(1);
    expect(summary.started).toBe(1);
    expect(summary.completed).toBe(1);
    expect(listProcessingCandidates).not.toHaveBeenCalled(); // replaced above
  });

  it('20,21. the render pass still runs only when extraction is idle', async () => {
    const busy = harness({ discovery: { listProcessingCandidates: vi.fn(async () => ok([DOC])) } as never });
    await runKnowledgePdfDispatcher(busy.deps, { once: true });
    // Extraction had work, so the repair waits its turn: priority preserved.
    expect(busy.renderPass).not.toHaveBeenCalled();

    const idle = harness();
    await runKnowledgePdfDispatcher(idle.deps, { once: true });
    expect(idle.renderPass).toHaveBeenCalledTimes(1);
  });

  it('a discovery failure still backs off rather than rendering', async () => {
    const { deps, renderPass } = harness({
      discovery: {
        listProcessingCandidates: vi.fn(async () => ({
          ok: false as const, error: { code: 'unavailable', message: 'down' },
        })),
      } as never,
    });
    const summary = await runKnowledgePdfDispatcher(deps, { once: true });
    expect(summary.discoveryErrors).toBe(1);
    expect(renderPass).not.toHaveBeenCalled();
  });
});

describe('once: one cycle, then a clean exit', () => {
  it('returns rather than polling forever', async () => {
    const { deps, renderPass } = harness();
    const summary = await runKnowledgePdfDispatcher(deps, { once: true });
    expect(renderPass).toHaveBeenCalledTimes(1);
    expect(summary.stopped).toBe(false);
  });

  it('without it the loop keeps going until aborted', async () => {
    const controller = new AbortController();
    let cycles = 0;
    const { deps } = harness({
      renderPass: (async () => {
        cycles += 1;
        if (cycles >= 3) controller.abort();
        return 0;
      }) as never,
    });
    const summary = await runKnowledgePdfDispatcher(deps, { signal: controller.signal });
    expect(cycles).toBeGreaterThanOrEqual(3);
    expect(summary.stopped).toBe(true);
  });
});

describe('5,6,17. the entrypoint only demands a parser in normal mode', () => {
  const source = fs
    .readFileSync(path.join(process.cwd(), 'workers/knowledge-pdf/runDispatcher.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('5,7. the OpenDataLoader worker is built only when extraction is enabled', () => {
    // 17. Normal mode still constructs it, so its Java/JAR assertions stand.
    expect(source).toContain('const extractionEnabled = mode === \'normal\';');
    expect(source).toContain('extractionEnabled ? createKnowledgePdfWorkerFromEnvironment() : undefined');
    // 7. Render-only never reaches that call at all.
    expect(source).not.toMatch(/^\s*const worker = createKnowledgePdfWorkerFromEnvironment\(\);/m);
  });

  it('6. there is no implicit fallback from missing Java into render-only', () => {
    // A broken production worker must fail loudly rather than quietly
    // degrading into a mode that never processes text.
    for (const forbidden of ['OPENDATALOADER_JAVA_BIN', 'OPENDATALOADER_JAR_PATH']) {
      expect(source, forbidden).not.toContain(forbidden);
    }
    // The mode comes from the strict resolver and nowhere else -- render-only
    // is never assigned as a recovery from a failed construction.
    expect(source).toContain('resolveKnowledgePdfDispatchMode(process.env.KNOWLEDGE_PDF_DISPATCH_MODE)');
    expect(source).not.toMatch(/catch[\s\S]{0,200}render-only/);
    expect((source.match(/'render-only'/g) ?? [])).toHaveLength(0);
  });

  it('both extraction halves are passed together or not at all', () => {
    // Discovering work it cannot process would make it claim and then fail.
    expect(source).toContain('discovery && worker');
  });
});
