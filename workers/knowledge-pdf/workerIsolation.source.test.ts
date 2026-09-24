import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const workerMarker = /workers[\\/]knowledge-pdf|processKnowledgePdfDocument|opendataloader-pdf-worker/i;
const pdfjsImport = /(?:from|require\(|import\()\s*['"][^'"]*pdfjs-dist/i;

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

/**
 * P6J-F9-A1b. PDF.js is worker-only, and the allowlist is exact in both
 * directions: no first-party importer may appear in the Next.js/browser trees,
 * and exactly these two worker modules may import it. A third importer is a
 * failure even inside workers/ -- that is how the boundary stays reviewable.
 */
const PDFJS_ALLOWED_IMPORTERS = [
  path.join('workers', 'knowledge-pdf', 'pdfGeometry.ts'),
  path.join('workers', 'knowledge-pdf', 'pdfPageRaster.ts'),
] as const;

/**
 * PATCH-177. The ONE browser-side PDF.js importer: the reader's selectable text
 * layer. Admitted by name, exactly like the worker allowlist, so a second
 * browser importer still fails here. It parses a file any board member may have
 * uploaded in every other viewer's browser, so it is admitted only LOCKED DOWN
 * (no eval, no XFA, no installed fonts -- pinned below) and it may carry none of
 * the worker's execution surface.
 */
const BROWSER_PDFJS_IMPORTER = path.join('components', 'collabboard', 'knowledgePdfDocumentCache.ts');
const isBrowserPdfjsImporter = (file: string) => path.relative(repoRoot, file) === BROWSER_PDFJS_IMPORTER;

describe('Knowledge PDF worker isolation', () => {
  it('keeps the worker executable out of Next.js and browser source trees', () => {
    const webFiles = [
      ...sourceFiles(path.join(repoRoot, 'app')),
      ...sourceFiles(path.join(repoRoot, 'components')),
    ];
    for (const file of webFiles) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(workerMarker);
      expect(source, file).not.toMatch(/(?:from|require\()\s*['"][^'"]*child_process/i);
      if (!isBrowserPdfjsImporter(file)) {
        expect(source, file).not.toMatch(/(?:from|require\()\s*['"][^'"]*pdfjs-dist/i);
      }
      expect(source, file).not.toContain('process.env.OPENDATALOADER_JAVA_BIN');
    }
  });

  it('admits exactly ONE first-party PDF.js importer in app, components, lib or hooks', () => {
    const importers: string[] = [];
    for (const root of ['app', 'components', 'lib', 'hooks']) {
      const directory = path.join(repoRoot, root);
      if (!fs.existsSync(directory)) continue;
      for (const file of sourceFiles(directory)) {
        if (pdfjsImport.test(fs.readFileSync(file, 'utf8'))) importers.push(path.relative(repoRoot, file));
      }
    }
    expect(importers).toEqual([BROWSER_PDFJS_IMPORTER]);
  });

  it('the browser importer loads PDF.js locked down, text-only, and never the Node build', () => {
    const source = fs.readFileSync(path.join(repoRoot, BROWSER_PDFJS_IMPORTER), 'utf8');
    expect(source).toContain('isEvalSupported: false');
    expect(source).toContain('enableXfa: false');
    expect(source).toContain('disableFontFace: true');
    expect(source).not.toContain('pdfjs-dist/legacy');
    expect(source).not.toMatch(/child_process|OPENDATALOADER/);
  });

  it('imports PDF.js from exactly the two worker-owned modules', () => {
    const importers = sourceFiles(path.join(repoRoot, 'workers'))
      .filter((file) => pdfjsImport.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(repoRoot, file))
      .sort();

    expect(importers).toEqual([...PDFJS_ALLOWED_IMPORTERS].sort());
  });

  it('keeps Java/OpenDataLoader execution in the isolated worker directory', () => {
    const workerSource = sourceFiles(path.join(repoRoot, 'workers', 'knowledge-pdf'))
      .map((file) => fs.readFileSync(file, 'utf8'))
      .join('\n');
    expect(workerSource).toMatch(/shell:\s*false/);
    expect(workerSource).toContain('OPENDATALOADER_PDF_VERSION = \'2.5.0\'');
    expect(workerSource).toContain('pdfjs-dist/legacy/build/pdf.mjs');
  });

  it('keeps the rasterizer free of Storage, network and browser surfaces', () => {
    const raster = fs.readFileSync(
      path.join(repoRoot, 'workers', 'knowledge-pdf', 'pdfPageRaster.ts'),
      'utf8',
    );
    for (const forbidden of [
      '@supabase', 'KnowledgeStorageGateway', 'knowledgeIngestion', 'knowledgePdfRenderPolicy',
      'fetch(', 'from \'react\'', 'next/', 'window.', 'document.getElementById',
      'devicePixelRatio', 'source_references', 'locator', 'processing_status', 'signedUrl',
    ]) {
      expect(raster, `the rasterizer must not contain ${forbidden}`).not.toContain(forbidden);
    }
  });
});
