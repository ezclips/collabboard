import { createClient } from '@supabase/supabase-js';
import { asKnowledgeDocumentId } from '../../lib/domain/core/ids';
import { SupabaseKnowledgeExtractionRepository } from '../../lib/infra/knowledge/knowledgeExtractionAdapters';
import { createKnowledgePdfWorkerFromEnvironment, processKnowledgePdfDocument } from './processKnowledgePdfDocument';
import {
  runKnowledgePdfDispatcher,
  resolveKnowledgePdfDispatcherConfig,
} from './dispatcher';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the Knowledge PDF dispatcher`);
  return value;
}

function positiveEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

const controller = new AbortController();
process.once('SIGTERM', () => controller.abort());
process.once('SIGINT', () => controller.abort());

try {
  const url = required('SUPABASE_URL');
  const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');
  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const discovery = new SupabaseKnowledgeExtractionRepository(client as never);
  const worker = createKnowledgePdfWorkerFromEnvironment();
  const config = resolveKnowledgePdfDispatcherConfig({
    concurrency: positiveEnv('KNOWLEDGE_PDF_WORKER_CONCURRENCY', 2),
    pollIntervalMs: positiveEnv('KNOWLEDGE_PDF_POLL_INTERVAL_MS', 5_000),
    discoveryLimit: positiveEnv('KNOWLEDGE_PDF_DISCOVERY_LIMIT', 16),
  });
  const summary = await runKnowledgePdfDispatcher(
    {
      discovery,
      processDocument: (documentId) => processKnowledgePdfDocument(worker, asKnowledgeDocumentId(documentId)),
    },
    { ...config, signal: controller.signal },
  );
  console.log(JSON.stringify({ event: 'knowledge-pdf-dispatcher-stopped', ...summary }));
} catch (error: unknown) {
  console.error(JSON.stringify({
    event: 'knowledge-pdf-dispatcher-configuration-error',
    error: error instanceof Error ? error.message : 'Dispatcher failed',
  }));
  process.exitCode = 2;
}
