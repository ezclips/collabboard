import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const workerMarker = /workers[\\/]knowledge-pdf|processKnowledgePdfDocument|opendataloader-pdf-worker/i;

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && (entry.name === 'node_modules' || entry.name === 'excalidraw_fork')) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(fullPath));
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name) && !entry.name.includes('.test.')) files.push(fullPath);
  }
  return files;
}

describe('Knowledge PDF worker isolation', () => {
  it('keeps the worker executable out of Next.js and browser source trees', () => {
    const webFiles = [
      ...sourceFiles(path.join(repoRoot, 'app')),
      ...sourceFiles(path.join(repoRoot, 'components')),
    ];
    for (const file of webFiles) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(workerMarker);
      expect(source, file).not.toMatch(/(?:from|require\()\s*['"][^'"]*(?:pdfjs-dist|child_process)/i);
      expect(source, file).not.toContain('process.env.OPENDATALOADER_JAVA_BIN');
    }
  });

  it('keeps Java/OpenDataLoader execution in the isolated worker directory', () => {
    const workerSource = sourceFiles(path.join(repoRoot, 'workers', 'knowledge-pdf'))
      .map((file) => fs.readFileSync(file, 'utf8'))
      .join('\n');
    expect(workerSource).toMatch(/shell:\s*false/);
    expect(workerSource).toContain('OPENDATALOADER_PDF_VERSION = \'2.5.0\'');
    expect(workerSource).toContain('pdfjs-dist/legacy/build/pdf.mjs');
  });
});
