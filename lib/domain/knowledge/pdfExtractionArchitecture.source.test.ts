import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('PDF Knowledge parser boundary', () => {
  it('keeps the public domain contract free of parser/runtime knowledge', () => {
    const domainSource = read('lib/domain/knowledge/pdfExtraction.ts');

    expect(domainSource).not.toMatch(/opendataloader|java|jvm|child_process|@opendataloader\/pdf/i);
  });

  it('keeps the parser-specific adapter above the domain contract', () => {
    const adapterSource = read('lib/infra/knowledge/openDataLoaderPdfNormalizer.ts');

    expect(adapterSource).toContain("from '../../domain/knowledge/pdfExtraction'");
    expect(adapterSource).not.toMatch(/from ['"]@opendataloader\/pdf['"]/);
  });
});
