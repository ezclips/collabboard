import { describe, expect, it } from 'vitest';
import { buildTemplateRows } from './rows';
import { RESEARCH } from '@/lib/collabboard/templates/freeform/research';

/**
 * PATCH-302. The `upload` post kind becomes an ordinary text row, with the
 * drop-zone flag in metadata, so every renderer that does not know the kind
 * still shows the instructions.
 */
describe('buildTemplateRows upload (PATCH-302)', () => {
  const rows = () => {
    let n = 0;
    return buildTemplateRows('board-1', RESEARCH, () => `id-${++n}`) as Array<Record<string, any>>;
  };

  it('writes the upload post as text carrying its HTML and manual placement', () => {
    const upload = rows().find((row) => row.metadata?.uploadDropZone === true)!;
    expect(upload.type).toBe('text');
    expect(upload.content).toContain('Drop a PDF here');
    expect(upload.position_x).toBe(470);
    expect(upload.position_y).toBe(300);
    expect(upload.width).toBe(560);
    expect(upload.height).toBe(340);
  });

  it('flags the row uploadDropZone and startExpanded with a manual size', () => {
    const upload = rows().find((row) => row.metadata?.uploadDropZone === true)!;
    expect(upload.metadata.uploadDropZone).toBe(true);
    expect(upload.metadata.startExpanded).toBe(true);
    expect(upload.metadata.manualSize).toBe(true);
  });
});
