import { canReadBoardKnowledge } from './knowledgeBoardReadAuthorization';
import type { KnowledgeBoardReadAuthorizationClient } from './knowledgeBoardReadAuthorization';
import { MAX_KNOWLEDGE_QUERY_LENGTH } from '../../../lib/domain/knowledge/knowledgeEmbedding';

const MAX_BODY_BYTES = 16 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_BODY_KEYS = new Set(['query', 'limit']);

export interface KnowledgeSearchProxySessionClient extends KnowledgeBoardReadAuthorizationClient {
  auth: {
    getUser(): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
    getSession(): Promise<{ data: { session: { access_token: string } | null }; error: unknown }>;
  };
}

interface ProxyContext { readonly params: Promise<{ id: string }> }

export interface KnowledgeSearchProxyDependencies {
  readonly canReadBoardKnowledge?: typeof canReadBoardKnowledge;
  readonly serviceUrl?: string;
  readonly fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

function validServiceUrl(value: string | undefined, path = '/v1/knowledge/search'): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const loopback = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(parsed.hostname.toLowerCase());
    if ((!loopback && parsed.protocol !== 'https:') || parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    return new URL(path, parsed).toString();
  } catch { return null; }
}

async function parseBody(request: Request): Promise<{ query: string; limit?: number } | Response> {
  let raw: string;
  try { raw = await request.text(); } catch { return json(400, { error: 'invalid_request' }); }
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json(413, { error: 'payload_too_large' });
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return json(400, { error: 'invalid_request' }); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return json(400, { error: 'invalid_request' });
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !ALLOWED_BODY_KEYS.has(key))) return json(400, { error: 'invalid_request' });
  if (typeof body.query !== 'string' || body.query.trim().length === 0 || body.query.length > MAX_KNOWLEDGE_QUERY_LENGTH) return json(400, { error: 'invalid_request' });
  if (body.limit !== undefined && (!Number.isInteger(body.limit) || (body.limit as number) < 1 || (body.limit as number) > 10)) return json(400, { error: 'invalid_request' });
  return { query: body.query.trim(), limit: body.limit as number | undefined };
}

function publicResults(value: unknown): Record<string, unknown>[] | null {
  if (!value || typeof value !== 'object' || !Array.isArray((value as Record<string, unknown>).results)) return null;
  return ((value as Record<string, unknown>).results as Record<string, unknown>[]).map((result) => ({
    chunkId: result.chunkId,
    documentId: result.documentId,
    originalFilename: result.originalFilename,
    pageStart: result.pageStart,
    pageEnd: result.pageEnd,
    chunkIndex: result.chunkIndex,
    text: result.text,
    sourceLocators: result.sourceLocators,
  }));
}

export async function handleKnowledgeSearchProxy(
  request: Request,
  context: ProxyContext,
  sessionClient: KnowledgeSearchProxySessionClient,
  dependencies: KnowledgeSearchProxyDependencies = {},
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const body = await parseBody(request);
  if (body instanceof Response) return body;
  const { id: boardId } = await context.params;
  if (!UUID_PATTERN.test(boardId)) return json(400, { error: 'invalid_request' });

  let user: { id: string } | null;
  try {
    const result = await sessionClient.auth.getUser();
    if (result.error || !result.data.user) return json(401, { error: 'unauthenticated' });
    user = result.data.user;
  } catch { return json(503, { error: 'service_unavailable' }); }

  let accessToken: string;
  try {
    const result = await sessionClient.auth.getSession();
    accessToken = result.data.session?.access_token ?? '';
    if (result.error || !accessToken) return json(401, { error: 'unauthenticated' });
  } catch { return json(503, { error: 'service_unavailable' }); }

  let authorized: boolean;
  try { authorized = await (dependencies.canReadBoardKnowledge ?? canReadBoardKnowledge)(sessionClient, boardId, user.id); }
  catch { return json(503, { error: 'service_unavailable' }); }
  if (!authorized) return json(403, { error: 'forbidden' });

  const endpoint = validServiceUrl(dependencies.serviceUrl ?? process.env.KNOWLEDGE_QUERY_SERVICE_URL);
  if (!endpoint) return json(503, { error: 'service_unavailable' });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const upstream = await (dependencies.fetchImpl ?? fetch)(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ boardId, query: body.query, ...(body.limit === undefined ? {} : { limit: body.limit }) }),
      signal: controller.signal,
    });
    if (!upstream.ok) return json(503, { error: 'service_unavailable' });
    const results = publicResults(await upstream.json() as unknown);
    return results ? json(200, { results }) : json(503, { error: 'service_unavailable' });
  } catch { return json(503, { error: 'service_unavailable' }); }
  finally { clearTimeout(timeout); }
}

export async function handleKnowledgeWarmProxy(
  request: Request,
  context: ProxyContext,
  sessionClient: KnowledgeSearchProxySessionClient,
  dependencies: KnowledgeSearchProxyDependencies = {},
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  let rawBody: string;
  try { rawBody = await request.text(); } catch { return json(400, { error: 'invalid_request' }); }
  if (rawBody.trim().length > 0) return json(400, { error: 'invalid_request' });
  const { id: boardId } = await context.params;
  if (!UUID_PATTERN.test(boardId)) return json(400, { error: 'invalid_request' });

  let user: { id: string };
  try {
    const result = await sessionClient.auth.getUser();
    if (result.error || !result.data.user) return json(401, { error: 'unauthenticated' });
    user = result.data.user;
  } catch { return json(503, { error: 'service_unavailable' }); }
  let accessToken: string;
  try {
    const result = await sessionClient.auth.getSession();
    accessToken = result.data.session?.access_token ?? '';
    if (result.error || !accessToken) return json(401, { error: 'unauthenticated' });
  } catch { return json(503, { error: 'service_unavailable' }); }
  try {
    if (!await (dependencies.canReadBoardKnowledge ?? canReadBoardKnowledge)(sessionClient, boardId, user.id)) return json(403, { error: 'forbidden' });
  } catch { return json(503, { error: 'service_unavailable' }); }

  const endpoint = validServiceUrl(dependencies.serviceUrl ?? process.env.KNOWLEDGE_QUERY_SERVICE_URL, '/v1/knowledge/warm');
  if (!endpoint) return json(503, { error: 'service_unavailable' });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const upstream = await (dependencies.fetchImpl ?? fetch)(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ boardId }),
      signal: controller.signal,
    });
    const payload = await upstream.json().catch(() => null) as { ok?: unknown } | null;
    return upstream.ok && payload?.ok === true ? json(200, { ok: true }) : json(503, { error: 'service_unavailable' });
  } catch { return json(503, { error: 'service_unavailable' }); }
  finally { clearTimeout(timeout); }
}
