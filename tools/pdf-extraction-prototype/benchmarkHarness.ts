import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { normalizeOpenDataLoaderPdf } from '../../lib/infra/knowledge/openDataLoaderPdfNormalizer';
import type { KnowledgePdfExtractionResult } from '../../lib/domain/knowledge/pdfExtraction';

export const PROTOTYPE_FIXTURES = [
  { name: 'simple-text', expectedPageCount: 2 },
  { name: 'two-column', expectedPageCount: 1 },
  { name: 'table', expectedPageCount: 1 },
  { name: 'mixed-layout', expectedPageCount: 1 },
] as const;

export interface NativeBenchmarkOptions {
  readonly fixtureDir: string;
  readonly artifactDir: string;
  readonly jarPath: string;
  readonly javaCommand: string;
  readonly repeat: number;
}

export function buildNativeCliArgs(
  jarPath: string,
  inputPath: string,
  outputDir: string,
): string[] {
  return [
    '-Djava.awt.headless=true',
    '-jar',
    jarPath,
    inputPath,
    '--format',
    'json,markdown',
    '--output-dir',
    outputDir,
    '--quiet',
  ];
}

export function stableSemanticProjection(result: KnowledgePdfExtractionResult): unknown {
  return {
    document: result.document,
    pages: result.pages,
    citationReady: result.citationReady,
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

export function semanticHash(result: KnowledgePdfExtractionResult): string {
  return crypto.createHash('sha256').update(stableStringify(stableSemanticProjection(result))).digest('hex');
}

function sha256(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
}

function findOutputFile(directory: string, extension: string): string | undefined {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .find(
      (entry) =>
        entry.isFile() &&
        entry.name !== 'summary.json' &&
        entry.name.toLowerCase().endsWith(extension),
    )
    ?.name;
}

function countElements(elements: KnowledgePdfExtractionResult['pages'][number]['elements']): number {
  return elements.reduce((count, element) => count + 1 + countElements(element.children ?? []), 0);
}

function countBboxes(elements: KnowledgePdfExtractionResult['pages'][number]['elements']): { present: number; valid: number } {
  return elements.reduce(
    (counts, element) => {
      const childCounts = countBboxes(element.children ?? []);
      const hasBbox = element.bbox !== undefined;
      return {
        present: counts.present + (hasBbox ? 1 : 0) + childCounts.present,
        valid:
          counts.valid +
          (hasBbox &&
          [element.bbox.left, element.bbox.bottom, element.bbox.right, element.bbox.top].every(Number.isFinite)
            ? 1
            : 0) +
          childCounts.valid,
      };
    },
    { present: 0, valid: 0 },
  );
}

export function summarizeNormalizedResult(
  result: KnowledgePdfExtractionResult,
  expectedPageCount?: number,
): Record<string, unknown> {
  const allElements = result.pages.flatMap((page) => page.elements);
  const bboxCounts = allElements.reduce(
    (counts, element) => {
      const current = countBboxes([element]);
      return { present: counts.present + current.present, valid: counts.valid + current.valid };
    },
    { present: 0, valid: 0 },
  );
  const typeCounts: Record<string, number> = {};
  const visit = (elements: KnowledgePdfExtractionResult['pages'][number]['elements']): void => {
    elements.forEach((element) => {
      typeCounts[element.type] = (typeCounts[element.type] ?? 0) + 1;
      visit(element.children ?? []);
    });
  };
  visit(allElements);

  return {
    expectedPageCount,
    extractedPageCount: result.document.pageCount,
    pageCountPass: expectedPageCount === undefined || expectedPageCount === result.document.pageCount,
    elementCount: allElements.reduce((count, element) => count + countElements([element]), 0),
    typeCounts,
    bboxCount: bboxCounts,
    citationReady: result.citationReady,
    semanticHash: semanticHash(result),
  };
}

export function checkCommand(command: string): { available: boolean; detail: string } {
  const probe = spawnSync(command, ['-version'], { encoding: 'utf8', windowsHide: true });
  if (!probe.error) return { available: true, detail: `${probe.stdout}${probe.stderr}`.trim() };
  return { available: false, detail: probe.error.message };
}

function runOne(
  fixtureName: string,
  expectedPageCount: number,
  options: NativeBenchmarkOptions,
  runNumber: number,
): Record<string, unknown> {
  const inputPath = path.join(options.fixtureDir, `${fixtureName}.pdf`);
  const runDir = path.join(options.artifactDir, fixtureName, `run-${runNumber}`);
  fs.mkdirSync(runDir, { recursive: true });
  const started = performance.now();
  const processResult = spawnSync(
    options.javaCommand,
    buildNativeCliArgs(options.jarPath, inputPath, runDir),
    { encoding: 'utf8', windowsHide: true },
  );
  const elapsedMs = Math.round(performance.now() - started);
  const jsonName = findOutputFile(runDir, '.json');
  const markdownName = findOutputFile(runDir, '.md') ?? findOutputFile(runDir, '.markdown');
  const jsonPath = jsonName ? path.join(runDir, jsonName) : undefined;
  const rawJson = jsonPath ? readJson(jsonPath) : undefined;
  const normalized = rawJson
    ? normalizeOpenDataLoaderPdf(rawJson, {
        contentSha256: sha256(inputPath),
        parser: { name: 'opendataloader-pdf', version: process.env.OPENDATALOADER_VERSION ?? 'unknown' },
        rawArtifact: {
          format: 'application/json',
          storageKey: path.relative(options.artifactDir, jsonPath as string),
        },
      })
    : undefined;
  const summary = {
    fixture: fixtureName,
    runNumber,
    exitStatus: processResult.status,
    signal: processResult.signal,
    elapsedMs,
    stdout: processResult.stdout ?? '',
    stderr: processResult.stderr ?? '',
    jsonOutput: jsonName ? path.relative(options.artifactDir, path.join(runDir, jsonName)) : undefined,
    markdownOutput: markdownName ? path.relative(options.artifactDir, path.join(runDir, markdownName)) : undefined,
    normalized: normalized ? summarizeNormalizedResult(normalized, expectedPageCount) : undefined,
  };
  fs.writeFileSync(path.join(runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  return { ...summary, normalizedResult: normalized };
}

export function runNativeBenchmark(options: NativeBenchmarkOptions): Record<string, unknown> {
  fs.mkdirSync(options.artifactDir, { recursive: true });
  const results = PROTOTYPE_FIXTURES.flatMap(({ name, expectedPageCount }) =>
    Array.from({ length: options.repeat }, (_, index) => runOne(name, expectedPageCount, options, index + 1)),
  );
  const byFixture = PROTOTYPE_FIXTURES.map(({ name, expectedPageCount }) => {
    const fixtureResults = results.filter((result) => result.fixture === name);
    const normalizedResults = fixtureResults
      .map((result) => result.normalizedResult as KnowledgePdfExtractionResult | undefined)
      .filter((result): result is KnowledgePdfExtractionResult => result !== undefined);
    const elapsedMs = fixtureResults.reduce((sum, result) => sum + Number(result.elapsedMs ?? 0), 0);
    const pageCount = normalizedResults[0]?.document.pageCount ?? expectedPageCount;
    return {
      fixture: name,
      expectedPageCount,
      runs: fixtureResults.length,
      elapsedMs,
      averageSecondsPerPage: pageCount > 0 ? elapsedMs / fixtureResults.length / pageCount / 1000 : undefined,
      deterministicRepeat:
        normalizedResults.length <= 1 || new Set(normalizedResults.map(semanticHash)).size === 1,
      runsWithOutput: normalizedResults.length,
      summaries: fixtureResults.map(({ normalizedResult: _normalizedResult, ...summary }) => summary),
    };
  });
  const report = { mode: 'native-local', repeat: options.repeat, fixtures: byFixture };
  fs.writeFileSync(path.join(options.artifactDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
