import { createClient } from '@supabase/supabase-js';
import { asKnowledgeDocumentId } from '../../lib/domain/core/ids';
import { SupabaseKnowledgeExtractionRepository } from '../../lib/infra/knowledge/knowledgeExtractionAdapters';
import { SupabaseKnowledgeRenderLifecycleRepository } from '../../lib/infra/knowledge/knowledgeRenderLifecycleAdapters';
import { createKnowledgeWorkerStorage } from './processKnowledgePdfDocument';
import { runKnowledgePageRenderPass } from './repairKnowledgePageDerivatives';
import { createKnowledgePdfWorkerFromEnvironment, processKnowledgePdfDocument } from './processKnowledgePdfDocument';
import {
  runKnowledgePdfDispatcher,
  resolveKnowledgePdfDispatcherConfig,
  resolveKnowledgePdfDispatchMode,
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
  /**
   * The mode is read BEFORE anything is constructed, because that is the whole
   * point: in render-only the OpenDataLoader worker is never built, so its
   * Java and JAR paths are never asserted. Repairing a derived page image
   * needs Storage and a rasteriser, not a parser -- an operator recovering a
   * missing preview should not have to provision an extraction runtime.
   *
   * There is no fallback from missing Java into render-only. A production
   * worker that cannot parse must fail loudly, not quietly stop doing the job
   * it exists for.
   */
  const mode = resolveKnowledgePdfDispatchMode(process.env.KNOWLEDGE_PDF_DISPATCH_MODE);
  const extractionEnabled = mode === 'normal';
  const discovery = extractionEnabled
    ? new SupabaseKnowledgeExtractionRepository(client as never)
    : undefined;
  const worker = extractionEnabled ? createKnowledgePdfWorkerFromEnvironment() : undefined;
  const config = resolveKnowledgePdfDispatcherConfig({
    concurrency: positiveEnv('KNOWLEDGE_PDF_WORKER_CONCURRENCY', 2),
    pollIntervalMs: positiveEnv('KNOWLEDGE_PDF_POLL_INTERVAL_MS', 5_000),
    discoveryLimit: positiveEnv('KNOWLEDGE_PDF_DISCOVERY_LIMIT', 16),
  });
  /**
   * PDF-R1. The repair path shares this process but nothing else: its own
   * lifecycle repository, its own candidate RPC, its own lease. It reuses the
   * worker's Storage seam because the bytes it needs are the same bytes.
   */
  const renderLifecycle = new SupabaseKnowledgeRenderLifecycleRepository(client as never);
  const renderStorage = createKnowledgeWorkerStorage(client);
  // Omitting BOTH halves is how render-only is expressed to the dispatcher, so
  // it never lists or claims an extraction job.
  const summary = await runKnowledgePdfDispatcher(
    {
      ...(discovery && worker
        ? {
          discovery,
          processDocument: (documentId: string) =>
            processKnowledgePdfDocument(worker, asKnowledgeDocumentId(documentId)),
        }
        : {}),
      renderPass: async (limit) => {
        const results = await runKnowledgePageRenderPass(
          { lifecycle: renderLifecycle, storage: renderStorage },
          limit,
        );
        return results.filter((result) => result.status === 'completed').length;
      },
    },
    {
      ...config,
      signal: controller.signal,
      // One cycle then exit, for an operator draining a known queue.
      once: process.env.KNOWLEDGE_PDF_DISPATCH_ONCE === '1',
    },
  );
  console.log(JSON.stringify({ event: 'knowledge-pdf-dispatcher-stopped', mode, ...summary }));
} catch (error: unknown) {
  console.error(JSON.stringify({
    event: 'knowledge-pdf-dispatcher-configuration-error',
    error: error instanceof Error ? error.message : 'Dispatcher failed',
  }));
  process.exitCode = 2;
}
