import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PATCH-236 Addendum 2. All three AI routes' `isDiagramSubtype` must exclude the
 * infographic subtype (a stored shape produced only by Show options, with an
 * empty system prompt) so a client cannot request it directly.
 */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('PATCH-236 the three isDiagramSubtype guards exclude infographic', () => {
  for (const route of [
    'app/api/ai/generate-component/route.ts',
    'app/api/ai/convert-component/route.ts',
    'app/api/ai/classify-intent/route.ts',
  ]) {
    it(`${route} rejects 'infographic'`, () => {
      const src = read(route);
      const start = src.indexOf('function isDiagramSubtype(');
      expect(start, 'isDiagramSubtype not found').toBeGreaterThan(-1);
      const body = src.slice(start, src.indexOf('\n}', start));
      expect(body).toContain("value !== 'infographic'");
    });
  }
});
