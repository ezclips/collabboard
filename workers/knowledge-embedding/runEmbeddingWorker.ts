import type {
  KnowledgeEmbeddingProfile,
  KnowledgeEmbeddingProvider,
  KnowledgeEmbeddingRepository,
} from '../../lib/domain/knowledge/knowledgeEmbedding';
import { createKnowledgeEmbeddingRepositoryFromEnvironment } from '../../lib/infra/knowledge/knowledgeEmbeddingAdapters';
import { OpenAIEmbeddingProvider } from './openAIEmbeddingProvider';
import { embedKnowledgeDocument } from './embedDocument';
import type { EmbedDocumentSummary } from './embedDocument';

const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
const DEFAULT_EMBEDDING_DIMENSIONS = 1536;
const DEFAULT_EMBEDDING_MODEL_ID = 'openai:text-embedding-3-small';

export interface KnowledgeEmbeddingWorkerConfig {
  readonly profile: KnowledgeEmbeddingProfile;
  readonly batchSize: number;
  readonly pollIntervalMs: number;
  readonly discoveryLimit: number;
  readonly createdAfter?: string | null;
}

export interface KnowledgeEmbeddingWorkerDependencies {
  readonly repository: KnowledgeEmbeddingRepository;
  readonly provider: KnowledgeEmbeddingProvider;
}

export interface KnowledgeEmbeddingPollSummary {
  readonly candidates: number;
  readonly documents: readonly EmbedDocumentSummary[];
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function required(environment: Record<string, string | undefined>, name: string): string {
  const value = environment[name];
  if (!value) throw new Error(`${name} is required for the embedding worker`);
  return value;
}

export function resolveKnowledgeEmbeddingConfig(
  environment: Record<string, string | undefined> = process.env,
): KnowledgeEmbeddingWorkerConfig & { readonly apiKey: string } {
  const dimensions = positiveInteger(
    environment.KNOWLEDGE_EMBEDDING_DIMENSIONS,
    DEFAULT_EMBEDDING_DIMENSIONS,
    'KNOWLEDGE_EMBEDDING_DIMENSIONS',
  );
  return {
    apiKey: required(environment, 'OPENAI_API_KEY'),
    profile: {
      model: environment.KNOWLEDGE_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL,
      modelId: environment.KNOWLEDGE_EMBEDDING_MODEL_ID || DEFAULT_EMBEDDING_MODEL_ID,
      dimensions,
    },
    batchSize: positiveInteger(environment.KNOWLEDGE_EMBEDDING_BATCH_SIZE, 16, 'KNOWLEDGE_EMBEDDING_BATCH_SIZE'),
    pollIntervalMs: positiveInteger(environment.KNOWLEDGE_EMBEDDING_POLL_INTERVAL_MS, 5_000, 'KNOWLEDGE_EMBEDDING_POLL_INTERVAL_MS'),
    discoveryLimit: positiveInteger(environment.KNOWLEDGE_EMBEDDING_DISCOVERY_LIMIT, 16, 'KNOWLEDGE_EMBEDDING_DISCOVERY_LIMIT'),
    createdAfter: environment.KNOWLEDGE_EMBEDDING_CREATED_AFTER || null,
  };
}

export function createKnowledgeEmbeddingWorkerFromEnvironment(
  environment: Record<string, string | undefined> = process.env,
): { readonly dependencies: KnowledgeEmbeddingWorkerDependencies; readonly config: KnowledgeEmbeddingWorkerConfig } {
  const resolved = resolveKnowledgeEmbeddingConfig(environment);
  return {
    dependencies: {
      repository: createKnowledgeEmbeddingRepositoryFromEnvironment(environment),
      provider: new OpenAIEmbeddingProvider({ apiKey: resolved.apiKey }),
    },
    config: {
      profile: resolved.profile,
      batchSize: resolved.batchSize,
      pollIntervalMs: resolved.pollIntervalMs,
      discoveryLimit: resolved.discoveryLimit,
      createdAfter: resolved.createdAfter,
    },
  };
}

export async function runKnowledgeEmbeddingPoll(
  deps: KnowledgeEmbeddingWorkerDependencies,
  config: KnowledgeEmbeddingWorkerConfig,
): Promise<KnowledgeEmbeddingPollSummary> {
  const documentIds = await deps.repository.listCandidateDocumentIds(
    config.profile,
    config.discoveryLimit,
    config.createdAfter,
  );
  const documents: EmbedDocumentSummary[] = [];
  for (const documentId of documentIds) {
    documents.push(await embedKnowledgeDocument(deps, {
      documentId,
      profile: config.profile,
      batchSize: config.batchSize,
    }));
  }
  return { candidates: documentIds.length, documents };
}

function waitForPoll(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

export async function runKnowledgeEmbeddingWorker(
  deps: KnowledgeEmbeddingWorkerDependencies,
  config: KnowledgeEmbeddingWorkerConfig,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    await runKnowledgeEmbeddingPoll(deps, config);
    if (!signal.aborted) await waitForPoll(config.pollIntervalMs, signal);
  }
}
