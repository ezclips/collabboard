import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PATCH-232 Addendum 2 -- Mermaid must emit SVG <text>/<tspan> labels, not
 * <foreignObject> HTML. The renderer sanitises the svg with a DOMPurify svg
 * profile that strips foreignObject, which left every label blank; setting
 * `htmlLabels: false` (globally and for flowcharts) keeps the labels while
 * `securityLevel: 'strict'` stays on.
 *
 * This file lives in lib/ai/ because that path IS collected by
 * vitest.config.ts's include list (unlike components/ai/renderers/ before
 * PATCH-232 Addendum 1).
 */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const engine = read('lib/ai/diagram-engine.ts');

describe('PATCH-232 Addendum 2: mermaid label settings', () => {
  it("keeps securityLevel 'strict'", () => {
    expect(engine).toContain("securityLevel: 'strict'");
  });

  it('disables HTML labels globally and for flowcharts', () => {
    // Both the global option and the flowchart-scoped one.
    expect((engine.match(/htmlLabels: false/g) ?? []).length).toBe(2);
    expect(engine).toMatch(/flowchart:\s*\{[\s\S]*?htmlLabels: false/);
  });

  it('softens the flow curve and greys the connector lines (PATCH-234)', () => {
    expect(engine).toMatch(/flowchart:\s*\{[\s\S]*?curve: 'basis'/);
    expect(engine).toContain("lineColor: '#9CA3AF'");
  });
});
