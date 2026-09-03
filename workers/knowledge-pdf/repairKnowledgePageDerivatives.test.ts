import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  KNOWLEDGE_RENDER_LEASE_TTL_SECONDS,
  repairKnowledgePageDerivatives,
  runKnowledgePageRenderPass,
  type KnowledgeRenderClaim,
  type KnowledgeRenderDependencies,
} from './repairKnowledgePageDerivatives';
import { KNOWLEDGE_PDF_RENDERER_VERSION } from '../../lib/domain/knowledge/knowledgePdfRenderPolicy';
import type { KnowledgeDocumentId } from '../../lib/domain/core/ids';

const BOARD = '11111111-1111-4111-8111-111111111111';
const DOC = '22222222-2222-4222-8222-222222222222';
const TOKEN = '33333333-3333-4333-8333-333333333333';
const asId = (value: string) => value as KnowledgeDocumentId;

const ok = <T>(value: T) => ({ ok: true as const, value });

const claim: KnowledgeRenderClaim = {
  documentId: DOC, boardId: BOARD, storagePath: 'knowledge/source.pdf',
  pageCount: 2, leaseToken: TOKEN,
};

/** A rasteriser that reports what it was handed and returns real-ish pages. */
function raster(pages = [1, 2], skipped: { pageNumber: number; reason: string }[] = []) {
  return vi.fn(async (bytes: Uint8Array) => ({
    pages: pages.map((pageNumber) => ({
      pageNumber, widthPx: 100, heightPx: 100, pixelCount: 10_000,
      // The bytes travel through untouched, which is what lets a test assert
      // that an embedded image survives the repair.
      bytes: new Uint8Array([bytes[0] ?? 0, pageNumber]),
    })),
    skipped,
  })) as unknown as KnowledgeRenderDependencies['rasterizePages'];
}

function deps(overrides: Partial<KnowledgeRenderDependencies> = {}) {
  const uploads: { path: string; bytes: Uint8Array; contentType: string }[] = [];
  const lifecycle = {
    listRenderCandidates: vi.fn(async () => ok([asId(DOC)])),
    claimRender: vi.fn(async () => ok(claim as KnowledgeRenderClaim | null)),
    completeRender: vi.fn(async () => ok(true)),
    failRender: vi.fn(async () => ok(true)),
  };
  const storage = {
    // 0xAA stands in for the embedded raster image's bytes.
    download: vi.fn(async () => new Uint8Array([0xaa, 0xbb])),
    upload: vi.fn(async (p: string, bytes: Uint8Array, contentType: string) => {
      uploads.push({ path: p, bytes, contentType });
    }),
    remove: vi.fn(async () => {}),
  };
  return {
    uploads,
    lifecycle,
    storage,
    resolved: {
      lifecycle, storage, rasterizePages: raster(), ...overrides,
    } as unknown as KnowledgeRenderDependencies,
  };
}

describe('20,21,22,24,25. a repair renders and completes', () => {
  it('reuses the original binary, the rasteriser and the deterministic paths', async () => {
    const d = deps();
    const result = await repairKnowledgePageDerivatives(d.resolved, asId(DOC));

    expect(result.status).toBe('completed');
    expect(result.rendered).toBe(2);
    // 21. The source the claim named, not a path the caller chose.
    expect(d.storage.download).toHaveBeenCalledWith('knowledge/source.pdf');
    // 22. The SAME deterministic derivative paths ingestion writes.
    expect(d.uploads.map((upload) => upload.path)).toEqual([
      `knowledge/${BOARD}/${DOC}/pages/1.webp`,
      `knowledge/${BOARD}/${DOC}/pages/2.webp`,
    ]);
    expect(d.uploads.every((upload) => upload.contentType === 'image/webp')).toBe(true);
    // 25. Completion happens only after every page landed, under the lease.
    expect(d.lifecycle.completeRender).toHaveBeenCalledWith(DOC, TOKEN, KNOWLEDGE_PDF_RENDERER_VERSION);
    expect(d.lifecycle.failRender).not.toHaveBeenCalled();
  });

  it('15. whatever the rasteriser produced is what gets stored', async () => {
    const d = deps();
    await repairKnowledgePageDerivatives(d.resolved, asId(DOC));
    // The embedded-image byte survives the repair untouched: nothing here
    // re-encodes, crops or post-processes a page.
    expect([...d.uploads[0].bytes]).toEqual([0xaa, 1]);
    expect([...d.uploads[1].bytes]).toEqual([0xaa, 2]);
  });

  it('claims with the shared renderer version and a bounded lease', async () => {
    const d = deps();
    await repairKnowledgePageDerivatives(d.resolved, asId(DOC));
    expect(d.lifecycle.claimRender).toHaveBeenCalledWith(
      DOC, KNOWLEDGE_PDF_RENDERER_VERSION, KNOWLEDGE_RENDER_LEASE_TTL_SECONDS,
    );
  });
});

describe('23. the repair never touches text', () => {
  it('calls no parser and writes no page rows', async () => {
    const d = deps();
    await repairKnowledgePageDerivatives(d.resolved, asId(DOC));
    // The dependency surface is the proof: there is nowhere for text to go.
    expect(Object.keys(d.lifecycle).sort())
      .toEqual(['claimRender', 'completeRender', 'failRender', 'listRenderCandidates']);
    expect(d.storage.remove).not.toHaveBeenCalled();
  });

  it('the module names no extraction authority at all', () => {
    const source = fs
      .readFileSync(path.join(process.cwd(), 'workers/knowledge-pdf/repairKnowledgePageDerivatives.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const forbidden of [
      'claim_knowledge_extraction', 'complete_knowledge_extraction', 'fail_knowledge_extraction',
      'processing_status', 'processing_attempt', 'raw_artifact_path', 'knowledge_pages',
      'openDataLoader', 'parser',
    ]) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });
});

describe('26,18. partial failure stays retryable', () => {
  it('a page that fails to upload prevents completion', async () => {
    const d = deps();
    let call = 0;
    d.storage.upload.mockImplementation(async () => {
      call += 1;
      if (call === 2) throw new Error('storage said no');
    });
    const result = await repairKnowledgePageDerivatives(d.resolved, asId(DOC));

    expect(result.status).toBe('failed');
    expect(result.reason).toBe('upload_partial');
    // Never recorded as done -- the request stays available for a retry.
    expect(d.lifecycle.completeRender).not.toHaveBeenCalled();
    expect(d.lifecycle.failRender).toHaveBeenCalledWith(DOC, TOKEN, 'upload_partial');
  });

  it('reports each failure with a low-cardinality reason, never a message', async () => {
    for (const [setup, reason] of [
      [(d: ReturnType<typeof deps>) => d.storage.download.mockRejectedValue(new Error('secret path detail')), 'download_failed'],
      [(d: ReturnType<typeof deps>) => d.storage.upload.mockRejectedValue(new Error('nope')), 'upload_failed'],
    ] as const) {
      const d = deps();
      setup(d);
      const result = await repairKnowledgePageDerivatives(d.resolved, asId(DOC));
      expect(result.reason).toBe(reason);
      expect(JSON.stringify(result)).not.toContain('secret path detail');
    }
  });

  it('a document that is text-only by policy is not forced to render', async () => {
    const d = deps();
    // Page count the eligibility policy refuses; repair recovers missing work,
    // it does not raise the limits ingestion applied.
    d.lifecycle.claimRender.mockResolvedValue(ok({ ...claim, pageCount: 5_000 }));
    const result = await repairKnowledgePageDerivatives(d.resolved, asId(DOC));
    expect(result.reason).toBe('ineligible');
    expect(d.storage.upload).not.toHaveBeenCalled();
  });
});

describe('16,17,27. concurrency is decided by the lease, not by hope', () => {
  it('an unclaimed document does no work at all', async () => {
    const d = deps();
    d.lifecycle.claimRender.mockResolvedValue(ok(null));
    const result = await repairKnowledgePageDerivatives(d.resolved, asId(DOC));

    expect(result.status).toBe('not_claimed');
    expect(d.storage.download).not.toHaveBeenCalled();
    expect(d.resolved.rasterizePages).not.toHaveBeenCalled();
  });

  it('27. two racing workers: only the claimant renders', async () => {
    const d = deps();
    let granted = 0;
    // Models the migration's single UPDATE: the first caller gets the token.
    d.lifecycle.claimRender.mockImplementation(async () => {
      granted += 1;
      return ok(granted === 1 ? claim : null);
    });
    const [first, second] = await Promise.all([
      repairKnowledgePageDerivatives(d.resolved, asId(DOC)),
      repairKnowledgePageDerivatives(d.resolved, asId(DOC)),
    ]);
    expect([first.status, second.status].sort()).toEqual(['completed', 'not_claimed']);
    expect(d.storage.download).toHaveBeenCalledTimes(1);
  });

  it('16. losing the lease mid-render discards the work rather than claiming it', async () => {
    const d = deps();
    d.lifecycle.completeRender.mockResolvedValue(ok(false));
    const result = await repairKnowledgePageDerivatives(d.resolved, asId(DOC));
    expect(result.status).toBe('lease_lost');
  });
});

describe('19,28. the pass is bounded and separate from extraction', () => {
  it('asks only the render candidate authority, with the current version', async () => {
    const d = deps();
    await runKnowledgePageRenderPass(d.resolved, 5);
    expect(d.lifecycle.listRenderCandidates)
      .toHaveBeenCalledWith(KNOWLEDGE_PDF_RENDERER_VERSION, 5);
  });

  it('a discovery failure yields nothing rather than a blind sweep', async () => {
    const d = deps();
    d.lifecycle.listRenderCandidates.mockResolvedValue(
      { ok: false, error: { code: 'unavailable', message: 'down' } } as never,
    );
    expect(await runKnowledgePageRenderPass(d.resolved, 5)).toEqual([]);
    expect(d.lifecycle.claimRender).not.toHaveBeenCalled();
  });

  it('28. a renderer upgrade is expressed by the version it passes down', async () => {
    const d = deps();
    await runKnowledgePageRenderPass(d.resolved, 5, '2');
    expect(d.lifecycle.listRenderCandidates).toHaveBeenCalledWith('2', 5);
    expect(d.lifecycle.completeRender).toHaveBeenCalledWith(DOC, TOKEN, '2');
  });
});
