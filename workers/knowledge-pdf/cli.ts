import { asKnowledgeDocumentId } from '../../lib/domain/core/ids';
import { processKnowledgePdfDocument, createKnowledgePdfWorkerFromEnvironment } from './processKnowledgePdfDocument';

const documentId = process.argv[2];
if (!documentId || process.argv.length !== 3) {
  console.error('Usage: vite-node workers/knowledge-pdf/cli.ts <knowledge-document-id>');
  process.exitCode = 2;
} else {
  try {
    const result = await processKnowledgePdfDocument(
      createKnowledgePdfWorkerFromEnvironment(),
      asKnowledgeDocumentId(documentId),
    );
    console.log(JSON.stringify(result));
    process.exitCode = result.status === 'failed' ? 1 : result.status === 'not_claimed' ? 2 : 0;
  } catch (error: unknown) {
    console.error(JSON.stringify({ status: 'configuration-error', error: error instanceof Error ? error.message : 'Worker failed' }));
    process.exitCode = 2;
  }
}
