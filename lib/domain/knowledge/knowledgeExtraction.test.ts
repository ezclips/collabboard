import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { asKnowledgeDocumentId } from '../core/ids';
import type { KnowledgeDocumentProcessingStatus } from './knowledgePersistence';
import type { KnowledgePdfExtractionResult } from './pdfExtraction';
import {
  KNOWLEDGE_CLAIMABLE_STATUSES,
  KNOWLEDGE_EXTRACTION_TRANSITIONS,
  KNOWLEDGE_PROCESSING_ERROR_MAX_LENGTH,
  buildKnowledgeExtractionPages,
  canTransitionKnowledgeStatus,
  claimKnowledgeDocumentForProcessing,
  completeKnowledgeExtraction,
  failKnowledgeExtraction,
  renewKnowledgeProcessingLease,
  sanitizeKnowledgeProcessingError,
} from './knowledgeExtraction';
import type {
  KnowledgeExtractionCompletion,
  KnowledgeExtractionRepository,
  KnowledgePageGeometryInput,
} from './knowledgeExtraction';

const DOCUMENT = asKnowledgeDocumentId('44444444-4444-4444-4444-444444444444');
const LEASE_TOKEN = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const hasher = {
  sha256: async (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex'),
};

function extraction(
  pages: readonly { pageNumber: number; text: string }[],
  overrides: Partial<KnowledgePdfExtractionResult['document']> = {},
): KnowledgePdfExtractionResult {
  return {
    parser: { name: 'opendataloader-pdf', version: '1.4.0', optionsHash: 'opts-abc' },
    document: { contentSha256: 'a'.repeat(64), pageCount: pages.length, ...overrides },
    pages: pages.map((page) => ({ ...page, elements: [] })),
    citationReady: false,
  };
}

function geometry(...pageNumbers: readonly number[]): KnowledgePageGeometryInput[] {
  return pageNumbers.map((pageNumber) => ({
    pageNumber,
    widthPoints: 612,
    heightPoints: 792,
    rotation: 0,
  }));
}

/** Records what reached the repository, and lets a test force an outcome. */
function repository(
  behaviour: Partial<KnowledgeExtractionRepository> = {},
): {
  repo: KnowledgeExtractionRepository;
  completions: KnowledgeExtractionCompletion[];
  failures: { id: string; message: string }[];
} {
  const completions: KnowledgeExtractionCompletion[] = [];
  const failures: { id: string; message: string }[] = [];
  const repo: KnowledgeExtractionRepository = {
    claim: behaviour.claim
      ?? (async (documentId, _leaseTtlSeconds) =>
        ({
          ok: true,
          value: {
            documentId,
            boardId: '11111111-1111-1111-1111-111111111111' as never,
            storagePath: `knowledge/board/${documentId}/original.pdf`,
            contentSha256: 'a'.repeat(64),
            leaseToken: LEASE_TOKEN,
            processingAttempt: 1,
            leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        })),
    renew: async () => ({
      ok: true,
      value: {
        leaseToken: LEASE_TOKEN,
        processingAttempt: 1,
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    }),
    complete:
      behaviour.complete
      ?? (async (completion) => {
        completions.push(completion);
        return { ok: true, value: undefined };
      }),
    fail:
      behaviour.fail
      ?? (async (documentId, _leaseToken, message) => {
        failures.push({ id: documentId, message });
        return { ok: true, value: undefined };
      }),
  };
  return { repo, completions, failures };
}

describe('the extraction state machine', () => {
  it('permits exactly uploaded->processing, processing->ready and processing->failed', () => {
    expect(canTransitionKnowledgeStatus('uploaded', 'processing')).toBe(true);
    expect(canTransitionKnowledgeStatus('processing', 'ready')).toBe(true);
    expect(canTransitionKnowledgeStatus('processing', 'failed')).toBe(true);
  });

  it('permits the failed -> processing retry', () => {
    expect(canTransitionKnowledgeStatus('failed', 'processing')).toBe(true);
    expect(KNOWLEDGE_CLAIMABLE_STATUSES).toEqual(['uploaded', 'failed']);
  });

  it('forbids every jump that would skip processing or reopen a committed result', () => {
    const forbidden: readonly [
      KnowledgeDocumentProcessingStatus,
      KnowledgeDocumentProcessingStatus,
    ][] = [
      ['uploaded', 'ready'],
      ['uploaded', 'failed'],
      ['ready', 'processing'],
      ['ready', 'failed'],
      ['failed', 'ready'],
      ['processing', 'uploaded'],
    ];
    for (const [from, to] of forbidden) {
      expect(canTransitionKnowledgeStatus(from, to)).toBe(false);
    }
  });

  it('treats ready as terminal -- extraction results are immutable in V1', () => {
    expect(KNOWLEDGE_EXTRACTION_TRANSITIONS.ready).toEqual([]);
  });
});

describe('page consistency validation', () => {
  it('accepts a consistent result and returns pages sorted by page number', () => {
    const result = buildKnowledgeExtractionPages(
      extraction([
        { pageNumber: 2, text: 'second' },
        { pageNumber: 1, text: 'first' },
      ]),
      geometry(2, 1),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((page) => page.pageNumber)).toEqual([1, 2]);
    expect(result.value[0].text).toBe('first');
    expect(result.value[0].widthPoints).toBe(612);
    expect(result.value[0].heightPoints).toBe(792);
  });

  it('rejects an empty extraction', () => {
    const result = buildKnowledgeExtractionPages(extraction([]), []);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('validation');
  });

  it('rejects 0-based or non-integer page numbers', () => {
    for (const pageNumber of [0, -1, 1.5]) {
      const result = buildKnowledgeExtractionPages(
        extraction([{ pageNumber, text: 'x' }]),
        [{ pageNumber, widthPoints: 612, heightPoints: 792 }],
      );
      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.message).toContain('1-based');
    }
  });

  it('rejects duplicate page numbers', () => {
    const result = buildKnowledgeExtractionPages(
      extraction([
        { pageNumber: 1, text: 'a' },
        { pageNumber: 1, text: 'b' },
      ]),
      geometry(1),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('duplicate');
  });

  it('rejects a declared page count that disagrees with the extracted pages', () => {
    const result = buildKnowledgeExtractionPages(
      extraction([{ pageNumber: 1, text: 'a' }], { pageCount: 7 }),
      geometry(1),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.details).toEqual({ declared: 7, extracted: 1 });
  });

  it('rejects missing geometry -- there is no A4 default', () => {
    const result = buildKnowledgeExtractionPages(
      extraction([
        { pageNumber: 1, text: 'a' },
        { pageNumber: 2, text: 'b' },
      ]),
      geometry(1),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('validation');
  });

  it('rejects geometry for a page that was never extracted', () => {
    const result = buildKnowledgeExtractionPages(
      extraction([{ pageNumber: 1, text: 'a' }]),
      geometry(1, 2),
    );
    expect(result.ok).toBe(false);
  });

  it('rejects duplicated geometry entries', () => {
    const result = buildKnowledgeExtractionPages(
      extraction([
        { pageNumber: 1, text: 'a' },
        { pageNumber: 2, text: 'b' },
      ]),
      geometry(1, 1),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('duplicate');
  });

  it('rejects zero, negative and non-finite geometry', () => {
    for (const bad of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = buildKnowledgeExtractionPages(
        extraction([{ pageNumber: 1, text: 'a' }]),
        [{ pageNumber: 1, widthPoints: bad, heightPoints: 792 }],
      );
      expect(result.ok).toBe(false);
    }
  });

  it('keeps rotation optional but requires it to be finite when present', () => {
    const absent = buildKnowledgeExtractionPages(
      extraction([{ pageNumber: 1, text: 'a' }]),
      [{ pageNumber: 1, widthPoints: 612, heightPoints: 792 }],
    );
    expect(absent.ok && absent.value[0].rotation).toBeNull();

    const bad = buildKnowledgeExtractionPages(
      extraction([{ pageNumber: 1, text: 'a' }]),
      [{ pageNumber: 1, widthPoints: 612, heightPoints: 792, rotation: Number.NaN }],
    );
    expect(bad.ok).toBe(false);
  });
});

describe('completeKnowledgeExtraction', () => {
  it('persists page rows, parser provenance and the supplied raw artifact path', async () => {
    const { repo, completions } = repository();
    const result = await completeKnowledgeExtraction(
      { repository: repo, hasher },
      {
        documentId: DOCUMENT,
        processingLeaseToken: LEASE_TOKEN,
        extraction: extraction([
          { pageNumber: 1, text: 'first' },
          { pageNumber: 2, text: 'second' },
        ]),
        geometry: geometry(1, 2),
        rawArtifactPath: 'knowledge/board/doc/raw.json',
      },
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.pageCount).toBe(2);

    const committed = completions[0];
    expect(committed.documentId).toBe(DOCUMENT);
    expect(committed.pageCount).toBe(2);
    expect(committed.pages).toHaveLength(2);
    expect(committed.parserName).toBe('opendataloader-pdf');
    expect(committed.parserVersion).toBe('1.4.0');
    expect(committed.parserOptionsHash).toBe('opts-abc');
    expect(committed.rawArtifactPath).toBe('knowledge/board/doc/raw.json');
    expect(committed.expectedContentSha256).toBe('a'.repeat(64));
  });

  it('hashes each page text so page identity is verifiable later', async () => {
    const { repo, completions } = repository();
    await completeKnowledgeExtraction(
      { repository: repo, hasher },
      {
        documentId: DOCUMENT,
        processingLeaseToken: LEASE_TOKEN,
        extraction: extraction([{ pageNumber: 1, text: 'first' }]),
        geometry: geometry(1),
      },
    );

    expect(completions[0].pages[0].textHash).toBe(
      createHash('sha256').update(new TextEncoder().encode('first')).digest('hex'),
    );
  });

  it('defaults the raw artifact path to null and never generates one', async () => {
    const { repo, completions } = repository();
    await completeKnowledgeExtraction(
      { repository: repo, hasher },
      {
        documentId: DOCUMENT,
        processingLeaseToken: LEASE_TOKEN,
        extraction: extraction([{ pageNumber: 1, text: 'a' }]),
        geometry: geometry(1),
      },
    );
    expect(completions[0].rawArtifactPath).toBeNull();
  });

  it('never reaches the repository when the worker output is inconsistent', async () => {
    const complete = vi.fn();
    const { repo } = repository({ complete: complete as never });

    const result = await completeKnowledgeExtraction(
      { repository: repo, hasher },
      {
        documentId: DOCUMENT,
        processingLeaseToken: LEASE_TOKEN,
        extraction: extraction([{ pageNumber: 1, text: 'a' }]),
        geometry: [],
      },
    );

    expect(result.ok).toBe(false);
    expect(complete).not.toHaveBeenCalled();
  });

  it('surfaces a persistence failure instead of reporting success', async () => {
    const { repo } = repository({
      complete: async () => ({
        ok: false,
        error: { code: 'unavailable', message: 'commit failed' },
      }),
    });

    const result = await completeKnowledgeExtraction(
      { repository: repo, hasher },
      {
        documentId: DOCUMENT,
        processingLeaseToken: LEASE_TOKEN,
        extraction: extraction([{ pageNumber: 1, text: 'a' }]),
        geometry: geometry(1),
      },
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('unavailable');
  });

  it('propagates a stale-job not_found without retrying or recreating anything', async () => {
    const { repo } = repository({
      complete: async () => ({
        ok: false,
        error: { code: 'not_found', message: 'gone' },
      }),
    });

    const result = await completeKnowledgeExtraction(
      { repository: repo, hasher },
      {
        documentId: DOCUMENT,
        processingLeaseToken: LEASE_TOKEN,
        extraction: extraction([{ pageNumber: 1, text: 'a' }]),
        geometry: geometry(1),
      },
    );
    expect(!result.ok && result.error.code).toBe('not_found');
  });
});

describe('claimKnowledgeDocumentForProcessing', () => {
  it('returns only the fields a worker needs -- no user or profile data', async () => {
    const { repo } = repository();
    const result = await claimKnowledgeDocumentForProcessing({ repository: repo }, DOCUMENT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.value).sort()).toEqual([
      'boardId',
      'contentSha256',
      'documentId',
      'leaseExpiresAt',
      'leaseToken',
      'processingAttempt',
      'storagePath',
    ]);
  });

  it('surfaces the repository conflict when the document is already claimed', async () => {
    const { repo } = repository({
      claim: async () => ({
        ok: false,
        error: { code: 'conflict', message: 'already claimed' },
      }),
    });
    const result = await claimKnowledgeDocumentForProcessing({ repository: repo }, DOCUMENT);
    expect(!result.ok && result.error.code).toBe('conflict');
  });

  it('renews with a configurable lease TTL and rejects invalid operational TTLs', async () => {
    const { repo } = repository();
    const renewed = await renewKnowledgeProcessingLease(
      { repository: repo, leaseTtlSeconds: 2 },
      DOCUMENT,
      LEASE_TOKEN,
    );
    expect(renewed.ok).toBe(true);

    const invalid = await claimKnowledgeDocumentForProcessing(
      { repository: repo, leaseTtlSeconds: 0 },
      DOCUMENT,
    );
    expect(!invalid.ok && invalid.error.code).toBe('validation');
  });
});

describe('failure message sanitization', () => {
  it('keeps a plain message intact', () => {
    expect(sanitizeKnowledgeProcessingError(new Error('Parser exited with code 1'))).toBe(
      'Parser exited with code 1',
    );
  });

  it('drops stack frames', () => {
    const error = new Error('Boom');
    error.message = 'Boom\n    at run (/srv/worker/index.js:12:7)\n    at main (/srv/a.js:1:1)';
    const sanitized = sanitizeKnowledgeProcessingError(error);
    expect(sanitized).toBe('Boom');
    expect(sanitized).not.toContain('at run');
  });

  it('redacts credentials embedded in a command line or environment dump', () => {
    const sanitized = sanitizeKnowledgeProcessingError(
      'java -jar odl.jar --api_key=sk-live-abcdef SUPABASE_SERVICE_ROLE_KEY=super-secret-value',
    );
    expect(sanitized).not.toContain('sk-live-abcdef');
    expect(sanitized).not.toContain('super-secret-value');
    expect(sanitized).toContain('[redacted]');
  });

  it('redacts JWT-shaped and long opaque tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJlX3ZhbHVl';
    const sanitized = sanitizeKnowledgeProcessingError(`upload rejected for ${jwt}`);
    expect(sanitized).not.toContain(jwt);
    expect(sanitized).toContain('[redacted]');
  });

  it('bounds the stored message', () => {
    const sanitized = sanitizeKnowledgeProcessingError('page failed '.repeat(500));
    expect(sanitized.length).toBe(KNOWLEDGE_PROCESSING_ERROR_MAX_LENGTH);
  });

  it('redacts an unbroken opaque blob rather than storing a truncated prefix of it', () => {
    // A 5000-character run with no separators is exactly what a leaked key or
    // a base64 payload looks like; truncating it would still persist 500
    // characters of the secret.
    expect(sanitizeKnowledgeProcessingError('x'.repeat(5000))).toBe('[redacted]');
  });

  it('falls back to a generic message when nothing usable is left', () => {
    expect(sanitizeKnowledgeProcessingError(undefined)).toBe('Extraction failed');
    expect(sanitizeKnowledgeProcessingError({})).toBe('Extraction failed');
    expect(sanitizeKnowledgeProcessingError('   ')).toBe('Extraction failed');
  });

  it('sanitizes before the message ever reaches the repository', async () => {
    const { repo, failures } = repository();
    await failKnowledgeExtraction(
      { repository: repo },
      DOCUMENT,
      LEASE_TOKEN,
      new Error('crashed\n    at frame (/x.js:1:1) password=hunter2'),
    );
    expect(failures[0].message).toBe('crashed');
    expect(failures[0].message).not.toContain('hunter2');
  });
});
