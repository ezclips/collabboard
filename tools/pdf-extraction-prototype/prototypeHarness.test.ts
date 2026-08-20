import { describe, expect, it } from 'vitest';
import {
  PROTOTYPE_FIXTURES,
  buildNativeCliArgs,
  semanticHash,
  stableSemanticProjection,
} from './benchmarkHarness';
import { normalizeOpenDataLoaderPdf } from '../../lib/infra/knowledge/openDataLoaderPdfNormalizer';

describe('PDF extraction prototype harness', () => {
  it('defines the four safe deterministic fixture cases', () => {
    expect(PROTOTYPE_FIXTURES).toEqual([
      { name: 'simple-text', expectedPageCount: 2 },
      { name: 'two-column', expectedPageCount: 1 },
      { name: 'table', expectedPageCount: 1 },
      { name: 'mixed-layout', expectedPageCount: 1 },
    ]);
  });

  it('constructs native-mode CLI arguments without hybrid or OCR flags', () => {
    const args = buildNativeCliArgs('fixture.jar', 'input.pdf', 'out');

    expect(args).toEqual([
      '-Djava.awt.headless=true',
      '-jar',
      'fixture.jar',
      'input.pdf',
      '--format',
      'json,markdown',
      '--output-dir',
      'out',
      '--quiet',
    ]);
    expect(args).not.toContain('--hybrid');
    expect(args).not.toContain('--force-ocr');
  });

  it('normalizes an actual-shaped small table response through the P1 contract', () => {
    const result = normalizeOpenDataLoaderPdf(
      {
        'file name': 'table.pdf',
        'number of pages': 1,
        kids: [
          {
            type: 'table',
            id: 10,
            'page number': 1,
            'bounding box': [72, 400, 540, 600],
            rows: [
              {
                type: 'table row',
                cells: [
                  {
                    type: 'table cell',
                    id: 11,
                    'page number': 1,
                    'bounding box': [72, 500, 300, 600],
                    'row number': 1,
                    'column number': 1,
                    'row span': 1,
                    'column span': 1,
                    kids: [{ type: 'paragraph', id: 12, 'page number': 1, content: 'Name' }],
                  },
                ],
              },
            ],
          },
        ],
      },
      { contentSha256: 'fixture-sha', parser: { name: 'opendataloader-pdf', version: 'fixture' } },
    );

    expect(result.pages[0].elements[0].type).toBe('table');
    expect(result.pages[0].elements[0].children?.[0]).toMatchObject({
      type: 'table-cell',
      sourceElementId: '11',
      text: 'Name',
    });
  });

  it('compares deterministic semantic output while excluding parser/artifact metadata', () => {
    const base = normalizeOpenDataLoaderPdf(
      { 'number of pages': 1, kids: [{ type: 'paragraph', id: 1, 'page number': 1, content: 'same' }] },
      {
        contentSha256: 'same-sha',
        parser: { name: 'opendataloader-pdf', version: 'one' },
        rawArtifact: { format: 'application/json', storageKey: 'run-one.json' },
      },
    );
    const repeat = normalizeOpenDataLoaderPdf(
      { 'number of pages': 1, kids: [{ type: 'paragraph', id: 1, 'page number': 1, content: 'same' }] },
      {
        contentSha256: 'same-sha',
        parser: { name: 'opendataloader-pdf', version: 'two' },
        rawArtifact: { format: 'application/json', storageKey: 'run-two.json' },
      },
    );

    expect(stableSemanticProjection(base)).toEqual(stableSemanticProjection(repeat));
    expect(semanticHash(base)).toBe(semanticHash(repeat));
  });
});
