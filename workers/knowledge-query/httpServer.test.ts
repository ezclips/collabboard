import { request as httpRequest } from 'node:http';
import { describe, expect, it } from 'vitest';
import { createKnowledgeQueryHttpServer, type QueryHttpRequest } from './httpServer';

async function withServer(handler: (request: QueryHttpRequest) => Promise<{ status: number; body: Record<string, unknown> }>, run: (port: number) => Promise<void>) {
  const server = createKnowledgeQueryHttpServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('listener did not bind');
  try { await run(address.port); } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
}

async function call(port: number, method: string, path: string, body?: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }>((resolve, reject) => {
    const request = httpRequest({ host: '127.0.0.1', port, method, path, headers: { ...(body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } : {}), ...headers } }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      response.on('end', () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

describe('knowledge query HTTP transport', () => {
  it('serves health and routes the search POST with a server request id', async () => {
    let received: QueryHttpRequest | undefined;
    await withServer(async (request) => { received = request; return { status: 200, body: { results: [] } }; }, async (port) => {
      const health = await call(port, 'GET', '/health');
      expect(health.status).toBe(200);
      expect(JSON.parse(health.body)).toEqual({ ok: true });
      const search = await call(port, 'POST', '/v1/knowledge/search', '{"boardId":"b","query":"q"}', { authorization: 'Bearer token' });
      expect(search.status).toBe(200);
      expect(JSON.parse(search.body)).toEqual({ results: [] });
      expect(received?.requestId).toMatch(/^[0-9a-f-]{36}$/);
      expect(received?.authorization).toBe('Bearer token');
      expect(search.headers['cache-control']).toBe('no-store');
      expect(search.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  it('returns generic route, method, JSON, and body-size errors', async () => {
    await withServer(async () => ({ status: 200, body: {} }), async (port) => {
      expect((await call(port, 'GET', '/unknown')).status).toBe(404);
      expect((await call(port, 'GET', '/v1/knowledge/search')).status).toBe(405);
      expect((await call(port, 'POST', '/v1/knowledge/search', '{bad')).status).toBe(400);
      expect((await call(port, 'POST', '/v1/knowledge/search', 'x'.repeat(16 * 1024 + 1))).status).toBe(413);
    });
  });
});
