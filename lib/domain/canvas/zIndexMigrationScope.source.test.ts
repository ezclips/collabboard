import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PATCH-309. The one-time zIndex migration must not run on layouts that never
 * read stacking order, nor for a visitor who cannot write the board -- and a
 * failed write must never escape as an unhandled rejection.
 */
const src = fs.readFileSync(
  path.join(process.cwd(), 'app/dashboard/canvas/[id]/CanvasClient.tsx'),
  'utf8',
);

describe('PATCH-309: the zIndex migration is scoped and never throws', () => {
  const start = src.indexOf('// One-time migration for existing posts');
  const effect = src.slice(start, src.indexOf('const getClickedSide = useCallback(', start));

  it('is gated on Freeform or Drawing and on board edit authority', () => {
    expect(start).toBeGreaterThan(-1);
    expect(effect).toContain('(isFreeformLayout || isDrawingLayout) && canEditBoardContent');
  });

  it('checks the gate before marking the migration done', () => {
    const gate = effect.indexOf('(isFreeformLayout || isDrawingLayout) && canEditBoardContent');
    const done = effect.indexOf('zIndexMigrationDoneRef.current = true');
    expect(gate).toBeGreaterThan(-1);
    expect(done).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(done);
  });

  it('its async body reports a failure instead of throwing out', () => {
    const bodyStart = effect.indexOf('const migrate = async () => {');
    const bodyEnd = effect.indexOf('migrate();', bodyStart);
    expect(bodyStart).toBeGreaterThan(-1);
    expect(bodyEnd).toBeGreaterThan(bodyStart);
    const body = effect.slice(bodyStart, bodyEnd);
    expect(body).not.toContain('throw');
    expect(body).toContain("console.error('[canvas] zIndex migration failed'");
  });
});
