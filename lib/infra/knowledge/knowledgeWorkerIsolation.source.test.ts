import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
function rgProduction(pattern: string, roots: readonly string[]): string {
  try {
    return execFileSync('rg', ['-n', '--no-heading', '--glob', '!*.test.*', '--glob', '!*.spec.*', '--glob', '!**/test-fixtures/**', pattern, ...roots], { cwd: root, encoding: 'utf8' });
  } catch (error) {
    if ((error as { status?: number }).status === 1) return '';
    throw error;
  }
}

describe('knowledge worker boundary', () => {
  it('keeps production app/components/lib sources independent of workers', () => {
    expect(rgProduction('workers[\\/]knowledge-(?:embedding|query)', ['app', 'components', 'lib'])).toBe('');
  });

  it('guards a future knowledge-query worker from ingestion execution', () => {
    const queryRoot = path.join(root, 'workers', 'knowledge-query');
    if (!fs.existsSync(queryRoot)) return;
    expect(rgProduction('runEmbeddingWorker|upsertEmbeddings|listCandidateDocumentIds|embedKnowledgeDocument', ['workers/knowledge-query'])).toBe('');
  });
});
