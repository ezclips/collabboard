import { assertLocalTeiUrl, LocalTeiEmbeddingProvider } from '../../lib/infra/knowledge/localTeiEmbeddingProvider';
import { searchKnowledge } from '../../lib/domain/knowledge/knowledgeSemanticSearch';
import { createKnowledgeSemanticSearchRepositoryFromEnvironment } from '../../lib/infra/knowledge/knowledgeSemanticSearchAdapters';
import type { KnowledgeEmbeddingProfile } from '../../lib/domain/knowledge/knowledgeEmbedding';
import { summarizeQuerySmokeResults, validateQuerySmokeConfig, type QuerySmokeOutput } from './querySmoke';

const PROFILE: KnowledgeEmbeddingProfile = { model: 'voyageai/voyage-4-nano', modelId: 'local:voyage-4-nano', dimensions: 1024 };
const HEALTH_WAIT_MS = 180_000;
const HEALTH_INTERVAL_MS = 2_000;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error('missing configuration');
  return value;
}

function safeFailure(teiReady = false): QuerySmokeOutput {
  return summarizeQuerySmokeResults([], '', '', teiReady);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForTei(baseUrl: string): Promise<boolean> {
  const endpoint = new URL('/health', assertLocalTeiUrl(baseUrl)).toString();
  const deadline = Date.now() + HEALTH_WAIT_MS;
  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(HEALTH_INTERVAL_MS, remaining));
    try {
      const response = await fetch(endpoint, { method: 'GET', credentials: 'omit', signal: controller.signal });
      if (response.ok) return true;
    } catch {
      // Readiness failures are intentionally silent; the final event is safe-only.
    } finally {
      clearTimeout(timeout);
    }
    await sleep(Math.min(HEALTH_INTERVAL_MS, Math.max(0, deadline - Date.now())));
  }
  return false;
}

async function run(): Promise<QuerySmokeOutput> {
  const providerName = required('KNOWLEDGE_EMBEDDING_PROVIDER');
  const model = required('KNOWLEDGE_EMBEDDING_MODEL');
  const modelId = required('KNOWLEDGE_EMBEDDING_MODEL_ID');
  const dimensions = Number(required('KNOWLEDGE_EMBEDDING_DIMENSIONS'));
  const teiUrl = required('KNOWLEDGE_EMBEDDING_TEI_URL');
  const query = required('KNOWLEDGE_QUERY_SMOKE_QUERY');
  const boardId = required('KNOWLEDGE_QUERY_SMOKE_BOARD_ID');
  const expectedDocumentId = required('KNOWLEDGE_QUERY_SMOKE_EXPECTED_DOCUMENT_ID');
  const forbiddenDocumentId = required('KNOWLEDGE_QUERY_SMOKE_FORBIDDEN_DOCUMENT_ID');
  required('SUPABASE_URL');
  required('SUPABASE_SERVICE_ROLE_KEY');
  validateQuerySmokeConfig({ provider: providerName, teiUrl, model, modelId, dimensions, query, boardId, expectedDocumentId, forbiddenDocumentId });
  const teiReady = await waitForTei(teiUrl);
  if (!teiReady) return safeFailure(false);
  const requestTimeoutMs = process.env.KNOWLEDGE_EMBEDDING_REQUEST_TIMEOUT_MS ? Number(process.env.KNOWLEDGE_EMBEDDING_REQUEST_TIMEOUT_MS) : undefined;
  const provider = new LocalTeiEmbeddingProvider({ baseUrl: teiUrl, requestTimeoutMs });
  const repository = createKnowledgeSemanticSearchRepositoryFromEnvironment();
  const results = await searchKnowledge({ query, boardId, profile: PROFILE, provider, repository, limit: 10, minSimilarity: null });
  return summarizeQuerySmokeResults(results, expectedDocumentId, forbiddenDocumentId, true);
}

try {
  const output = await run();
  console.log(JSON.stringify(output));
  process.exitCode = output.pass ? 0 : 1;
} catch {
  console.log(JSON.stringify(safeFailure(false)));
  process.exitCode = 1;
}
