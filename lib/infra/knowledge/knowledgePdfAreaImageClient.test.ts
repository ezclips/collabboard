import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  knowledgePdfAreaImageEndpoint,
  requestKnowledgePdfAreaImage,
} from './knowledgePdfAreaImageClient';
import type { KnowledgeSourceAreaClipPayload } from '../../domain/knowledge/knowledgeSourceClipPayload';

/**
 * R6B, group E -- the transport. The browser sends identity, a rectangle and a
 * placement; it never reads the PDF, never rasterises and never uploads bytes.
 */

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const DOC_ID = '55555555-5555-4555-8555-555555555555';

const PAYLOAD: KnowledgeSourceAreaClipPayload = {
  kind: 'area',
  sourceDocumentId: DOC_ID,
  originalFilename: 'synthetic.pdf',
  pageNumber: 3,
  region: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
};

const PLACEMENT = { positionX: 120, positionY: 340 };

const jsonResponse = (body: unknown, status = 201) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function send(response: Response | Error) {
  const fetchImpl = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  const result = await requestKnowledgePdfAreaImage(BOARD_ID, PAYLOAD, PLACEMENT, fetchImpl as never);
  return { result, fetchImpl };
}

describe('E1-E4: it asks the server to create the card', () => {
  it('E1: posts to the board-scoped same-origin endpoint', async () => {
    const { fetchImpl } = await send(jsonResponse({ padlet: { id: 'x' } }));
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/boards/${BOARD_ID}/knowledge/area-image`);
    expect(knowledgePdfAreaImageEndpoint(BOARD_ID)).toBe(url);
    expect(init.method).toBe('POST');
  });

  it('E2: sends exactly the six client-owned fields, built one by one', async () => {
    const { fetchImpl } = await send(jsonResponse({ padlet: { id: 'x' } }));
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      'knowledgeDocumentId', 'pageNumber', 'positionX', 'positionY', 'region', 'title',
    ]);
    expect(body.knowledgeDocumentId).toBe(DOC_ID);
    expect(body.pageNumber).toBe(3);
    expect(body.region).toEqual(PAYLOAD.region);
  });

  it('E3: sends NO image bytes, no path, no bucket and no size', async () => {
    const { fetchImpl } = await send(jsonResponse({ padlet: { id: 'x' } }));
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const raw = String(init.body);
    for (const forbidden of ['base64', 'data:image', 'bytes', 'storagePath', 'bucket', 'padlet-files']) {
      expect(raw, forbidden).not.toContain(forbidden);
    }
    // No card size either: the server derives it from the persisted page
    // geometry. (`width`/`height` exist only INSIDE the normalized rectangle.)
    const body = JSON.parse(raw) as Record<string, unknown>;
    expect(body).not.toHaveProperty('width');
    expect(body).not.toHaveProperty('height');
  });

  it('E4: a forged transfer field cannot ride along into the request', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ padlet: { id: 'x' } }));
    await requestKnowledgePdfAreaImage(
      BOARD_ID,
      { ...PAYLOAD, storagePath: 'board-derived/other/x.webp', imageBytes: 'AAAA' } as never,
      PLACEMENT,
      fetchImpl as never,
    );
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(init.body)).not.toContain('storagePath');
    expect(String(init.body)).not.toContain('imageBytes');
  });
});

describe('E5-E9: nothing partial is ever reported as created', () => {
  it('E5: a created card is returned as-is', async () => {
    const { result } = await send(jsonResponse({ padlet: { id: 'card-1', type: 'image' } }));
    expect(result).toEqual({ ok: true, padlet: { id: 'card-1', type: 'image' } });
  });

  it('E6: a refusal reports its status so the surface can explain it', async () => {
    for (const status of [400, 401, 403, 404, 409, 503]) {
      const { result } = await send(jsonResponse({ error: 'no' }, status));
      expect(result, String(status)).toEqual({ ok: false, status });
    }
  });

  it('E7: a network failure is a clean failure, not a silent success', async () => {
    const { result } = await send(new Error('offline'));
    expect(result).toEqual({ ok: false, status: null });
  });

  it('E8: an unparseable or shapeless success body is still a failure', async () => {
    const broken = [
      new Response('not json', { status: 201 }),
      jsonResponse({}),
      jsonResponse({ padlet: null }),
      jsonResponse({ padlet: 'card' }),
      jsonResponse({ padlet: [] }),
      jsonResponse([]),
    ];
    for (const response of broken) {
      const { result } = await send(response);
      expect(result.ok).toBe(false);
    }
  });

  it('E9: the module contains no PDF, raster or upload machinery of its own', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'lib/infra/knowledge/knowledgePdfAreaImageClient.ts'), 'utf8',
    ).toLowerCase();
    for (const forbidden of ['pdfjs', 'pdf.js', 'canvas', 'html2canvas', 'toblob', 'todataurl',
      'formdata', '.upload(', 'workers/knowledge-pdf', 'getpublicurl']) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });
});
