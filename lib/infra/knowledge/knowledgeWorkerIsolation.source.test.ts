import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const generatedDirectories = new Set(['.git', '.next', 'build', 'coverage', 'dist', 'node_modules', 'out', 'test-results']);

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

export function containsKnowledgeWorkerReference(source: string): boolean {
  return /workers[\\/]knowledge-(?:embedding|query)(?:[\\/]|["'`])/.test(stripComments(source));
}

function productionSourceFiles(relativeRoot: string): string[] {
  const absoluteRoot = path.join(root, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(absoluteRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && !generatedDirectories.has(entry.name)) {
      files.push(...productionSourceFiles(path.join(relativeRoot, entry.name)));
    } else if (entry.isFile() && sourceExtensions.has(path.extname(entry.name)) && !/\.(test|spec)\.[^.]+$/.test(entry.name)) {
      files.push(path.join(relativeRoot, entry.name));
    }
  }
  return files;
}

describe('knowledge worker boundary', () => {
  it('keeps production app/components/lib sources independent of workers', () => {
    const references = ['app', 'components', 'lib'].flatMap(productionSourceFiles).filter((file) =>
      containsKnowledgeWorkerReference(fs.readFileSync(path.join(root, file), 'utf8')),
    );
    expect(references).toEqual([]);
  });

  it('guards a future knowledge-query worker from ingestion execution', () => {
    const queryRoot = path.join(root, 'workers', 'knowledge-query');
    if (!fs.existsSync(queryRoot)) return;
    for (const file of productionSourceFiles(path.join('workers', 'knowledge-query'))) {
      expect(stripComments(fs.readFileSync(path.join(root, file), 'utf8'))).not.toMatch(/runEmbeddingWorker|upsertEmbeddings|listCandidateDocumentIds|embedKnowledgeDocument/);
    }
  });

  it('detects relative, alias, and backslash worker references while ignoring comments', () => {
    expect(containsKnowledgeWorkerReference("import '../../../workers/knowledge-embedding/x'")).toBe(true);
    expect(containsKnowledgeWorkerReference("export { x } from '@/workers/knowledge-query/x'")).toBe(true);
    expect(containsKnowledgeWorkerReference("require('../../workers\\knowledge-embedding/x')")).toBe(true);
    expect(containsKnowledgeWorkerReference('// workers/knowledge-embedding/comment-only')).toBe(false);
  });
});
