import { createSupabaseQuerySecurityFromEnvironment } from './supabaseQuerySecurity';
import { createKnowledgeQueryService, createKnowledgeWarmService } from './queryService';
import { createKnowledgeQueryHttpServer } from './httpServer';
import { LocalTeiEmbeddingProvider } from '../../lib/infra/knowledge/localTeiEmbeddingProvider';
import { createKnowledgeSemanticSearchRepositoryFromEnvironment } from '../../lib/infra/knowledge/knowledgeSemanticSearchAdapters';

try {
  const security = createSupabaseQuerySecurityFromEnvironment();
  const provider = new LocalTeiEmbeddingProvider({
    baseUrl: process.env.KNOWLEDGE_EMBEDDING_TEI_URL ?? '',
    requestTimeoutMs: process.env.KNOWLEDGE_EMBEDDING_REQUEST_TIMEOUT_MS ? Number(process.env.KNOWLEDGE_EMBEDDING_REQUEST_TIMEOUT_MS) : undefined,
  });
  const repository = createKnowledgeSemanticSearchRepositoryFromEnvironment();
  const service = createKnowledgeQueryService({ security, provider, repository });
  const warmService = createKnowledgeWarmService({ security });
  const server = createKnowledgeQueryHttpServer(async (request) => request.path === '/v1/knowledge/warm'
    ? warmService(request.body, request.authorization)
    : service(request.body, request.authorization));
  const port = Number(process.env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('invalid port');
  server.listen(port, '0.0.0.0');
} catch {
  console.log(JSON.stringify({ event: 'knowledge-query-service-startup-failed' }));
  process.exitCode = 1;
}
