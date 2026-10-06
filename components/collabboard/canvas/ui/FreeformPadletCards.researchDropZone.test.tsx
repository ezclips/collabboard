import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../../..');
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

/**
 * PATCH-302. A mounted render of the 6k-line canvas is impractical, so this
 * guards the wiring: the drop zone marks itself in the DOM and FreeformPadletCards
 * routes `uploadDropZone` posts to it instead of the note body.
 */
describe('FreeformPadletCards uploadDropZone branch (PATCH-302)', () => {
  const zone = read('components/collabboard/canvas/ui/ResearchDropZone.tsx');
  const cards = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');

  it('ResearchDropZone renders the data-research-drop-zone marker', () => {
    expect(zone).toContain('data-research-drop-zone');
  });

  it('ships the drop zone icon under public and credits it', () => {
    expect(zone).toContain('/templates/freeform/research/inbox-tray.svg');
    const icon = path.join(ROOT, 'public/templates/freeform/research/inbox-tray.svg');
    expect(fs.existsSync(icon)).toBe(true);
    const credits = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'public/templates/freeform/research/credits.json'), 'utf8'),
    ) as Array<{ file: string }>;
    expect(credits.map((entry) => entry.file)).toContain('inbox-tray.svg');
  });

  it('FreeformPadletCards renders ResearchDropZone for a post with uploadDropZone', () => {
    expect(cards).toContain('ResearchDropZone');
    expect(cards).toMatch(/uploadDropZone[\s\S]{0,120}<ResearchDropZone/);
  });

  it('keeps the note body from rendering under the drop zone', () => {
    expect(cards).toContain("(padlet.metadata as Record<string, unknown>).uploadDropZone !== true");
  });
});
