import { createKnowledgeEmbeddingWorkerFromEnvironment, runKnowledgeEmbeddingWorker } from './runEmbeddingWorker';

const controller = new AbortController();
process.once('SIGTERM', () => controller.abort());
process.once('SIGINT', () => controller.abort());

try {
  const worker = createKnowledgeEmbeddingWorkerFromEnvironment();
  await runKnowledgeEmbeddingWorker(worker.dependencies, worker.config, controller.signal);
  console.log(JSON.stringify({ event: 'knowledge-embedding-worker-stopped' }));
} catch {
  // Never emit provider responses, chunk text, vectors, or secret values.
  console.error(JSON.stringify({ event: 'knowledge-embedding-worker-failed' }));
  process.exitCode = 1;
}
