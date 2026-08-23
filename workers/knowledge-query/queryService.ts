import { canReadBoardKnowledge, type KnowledgeBoardReadAuthorizationClient } from '../../lib/server/knowledge/knowledgeBoardReadAuthorization';
import { validateKnowledgeQueryText, type KnowledgeQueryEmbeddingProvider, type KnowledgeSemanticSearchRepository } from '../../lib/domain/knowledge/knowledgeEmbedding';
import { QueryAuthenticationError, QueryAuthenticationUnavailableError } from './supabaseQuerySecurity';
import type { KnowledgeQuerySecurity } from './supabaseQuerySecurity';

export const KNOWLEDGE_QUERY_PROFILE = {
  model: 'voyageai/voyage-4-nano',
  modelId: 'local:voyage-4-nano',
  dimensions: 1024,
} as const;

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface KnowledgeQueryRequestBody {
  readonly boardId: string;
  readonly query: string;
  readonly limit?: number;
}

export interface KnowledgeQueryPublicResult {
  readonly chunkId: string;
  readonly documentId: string;
  readonly originalFilename: string;
  readonly pageStart: number;
  readonly pageEnd: number;
  readonly chunkIndex: number;
  readonly text: string;
  readonly sourceLocators: unknown;
}

export interface KnowledgeQueryServiceResponse {
  readonly status: 200 | 400 | 401 | 403 | 404 | 413 | 429 | 503;
  readonly body: Record<string, unknown>;
}

export interface KnowledgeQueryRateLimiter {
  consume(userId: string): boolean;
}

export class InMemoryKnowledgeQueryRateLimiter implements KnowledgeQueryRateLimiter {
  private readonly entries = new Map<string, number[]>();

  constructor(private readonly now: () => number = Date.now, private readonly windowMs = 60_000, private readonly maxAttempts = 10) {}

  consume(userId: string): boolean {
    const currentTime = this.now();
    const cutoff = currentTime - this.windowMs;
    for (const [key, timestamps] of this.entries) {
      const recent = timestamps.filter((timestamp) => timestamp > cutoff);
      if (recent.length === 0) this.entries.delete(key);
      else this.entries.set(key, recent);
    }
    const timestamps = this.entries.get(userId) ?? [];
    if (timestamps.length >= this.maxAttempts) return false;
    timestamps.push(currentTime);
    this.entries.set(userId, timestamps);
    return true;
  }
}

export interface KnowledgeQueryServiceDependencies {
  readonly security: KnowledgeQuerySecurity;
  readonly provider: KnowledgeQueryEmbeddingProvider;
  readonly repository: KnowledgeSemanticSearchRepository;
  readonly rateLimiter?: KnowledgeQueryRateLimiter;
}

function response(status: KnowledgeQueryServiceResponse['status'], code: string): KnowledgeQueryServiceResponse {
  return { status, body: { error: code } };
}

function parseRequestBody(value: unknown): KnowledgeQueryRequestBody {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_request');
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !['boardId', 'query', 'limit'].includes(key))) throw new Error('invalid_request');
  if (typeof body.boardId !== 'string' || !UUID_PATTERN.test(body.boardId)) throw new Error('invalid_request');
  if (typeof body.query !== 'string') throw new Error('invalid_request');
  validateKnowledgeQueryText(body.query);
  if (body.limit !== undefined && (!Number.isInteger(body.limit) || (body.limit as number) < 1)) throw new Error('invalid_request');
  return { boardId: body.boardId, query: body.query, limit: body.limit as number | undefined };
}

function parseWarmRequestBody(value: unknown): { boardId: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_request');
  const body = value as Record<string, unknown>;
  if (Object.keys(body).length !== 1 || typeof body.boardId !== 'string' || !UUID_PATTERN.test(body.boardId)) throw new Error('invalid_request');
  return { boardId: body.boardId };
}

function extractBearer(authorization: string | undefined): string {
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  if (!match) throw new QueryAuthenticationError();
  return match[1];
}

function publicResults(results: readonly { similarity: number; chunkId: string; documentId: string; originalFilename: string; pageStart: number; pageEnd: number; chunkIndex: number; text: string; sourceLocators: unknown }[]): KnowledgeQueryPublicResult[] {
  return results.map(({ similarity: _similarity, ...result }) => result);
}

export function createKnowledgeQueryService(dependencies: KnowledgeQueryServiceDependencies) {
  const rateLimiter = dependencies.rateLimiter ?? new InMemoryKnowledgeQueryRateLimiter();
  return async function handleKnowledgeQuery(
    bodyValue: unknown,
    authorization: string | undefined,
  ): Promise<KnowledgeQueryServiceResponse> {
    let body: KnowledgeQueryRequestBody;
    try { body = parseRequestBody(bodyValue); } catch { return response(400, 'invalid_request'); }

    let verified: { userId: string; client: KnowledgeBoardReadAuthorizationClient };
    try {
      verified = await dependencies.security.verifyAccessToken(extractBearer(authorization));
    } catch (error) {
      if (error instanceof QueryAuthenticationError) return response(401, 'unauthenticated');
      if (error instanceof QueryAuthenticationUnavailableError) return response(503, 'service_unavailable');
      return response(503, 'service_unavailable');
    }
    if (!rateLimiter.consume(verified.userId)) return response(429, 'rate_limited');

    let allowed: boolean;
    try { allowed = await canReadBoardKnowledge(verified.client, body.boardId, verified.userId); } catch { return response(503, 'authorization_unavailable'); }
    if (!allowed) return response(403, 'forbidden');

    try {
      const queryEmbedding = await dependencies.provider.embedQuery({ profile: KNOWLEDGE_QUERY_PROFILE, query: body.query });
      const results = await dependencies.repository.searchBoardKnowledge({
        boardId: body.boardId,
        queryEmbedding,
        profile: KNOWLEDGE_QUERY_PROFILE,
        limit: Math.min(body.limit ?? DEFAULT_LIMIT, MAX_LIMIT),
        minSimilarity: null,
      });
      return { status: 200, body: { results: publicResults(results) } };
    } catch { return response(503, 'service_unavailable'); }
  };
}

export function createKnowledgeWarmService(dependencies: Pick<KnowledgeQueryServiceDependencies, 'security'>) {
  return async function handleKnowledgeWarm(bodyValue: unknown, authorization: string | undefined): Promise<KnowledgeQueryServiceResponse> {
    let body: { boardId: string };
    try { body = parseWarmRequestBody(bodyValue); } catch { return response(400, 'invalid_request'); }

    let verified: { userId: string; client: KnowledgeBoardReadAuthorizationClient };
    try {
      verified = await dependencies.security.verifyAccessToken(extractBearer(authorization));
    } catch (error) {
      if (error instanceof QueryAuthenticationError) return response(401, 'unauthenticated');
      return response(503, 'service_unavailable');
    }
    try {
      if (!await canReadBoardKnowledge(verified.client, body.boardId, verified.userId)) return response(403, 'forbidden');
    } catch { return response(503, 'service_unavailable'); }
    return { status: 200, body: { ok: true } };
  };
}
