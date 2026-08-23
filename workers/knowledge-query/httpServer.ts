import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

const MAX_BODY_BYTES = 16 * 1024;
const SEARCH_PATH = '/v1/knowledge/search';

export interface QueryHttpRequest {
  readonly method: string;
  readonly path: string;
  readonly authorization: string | undefined;
  readonly body: unknown;
  readonly requestId: string;
}

export interface QueryHttpResponse {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

export type QueryHttpHandler = (request: QueryHttpRequest) => Promise<QueryHttpResponse>;

class PayloadTooLargeError extends Error {}

function writeJson(response: ServerResponse, status: number, body: Record<string, unknown>, noStore = false): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  if (noStore) response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        request.resume();
        reject(new PayloadTooLargeError());
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', () => reject(new Error('request failed')));
  });
}

export function createKnowledgeQueryHttpServer(handler: QueryHttpHandler): Server {
  const server = createServer(async (request, response) => {
    const requestId = randomUUID();
    const path = request.url?.split('?')[0] ?? '';
    if (path === '/health') {
      if (request.method !== 'GET') return writeJson(response, 405, { error: 'method_not_allowed' });
      return writeJson(response, 200, { ok: true }, true);
    }
    if (path !== SEARCH_PATH) return writeJson(response, 404, { error: 'not_found' });
    if (request.method !== 'POST') return writeJson(response, 405, { error: 'method_not_allowed' }, true);
    try {
      const rawBody = await readBody(request);
      let body: unknown;
      try { body = JSON.parse(rawBody); } catch { return writeJson(response, 400, { error: 'invalid_request' }, true); }
      const result = await handler({ method: request.method, path, authorization: request.headers.authorization, body, requestId });
      return writeJson(response, result.status, result.body, true);
    } catch (error) {
      if (error instanceof PayloadTooLargeError) return writeJson(response, 413, { error: 'payload_too_large' }, true);
      return writeJson(response, 400, { error: 'invalid_request' }, true);
    }
  });
  server.requestTimeout = 180_000;
  return server;
}
