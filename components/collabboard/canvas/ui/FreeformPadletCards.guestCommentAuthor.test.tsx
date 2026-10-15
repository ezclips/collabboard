import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../../..');
const cards = fs.readFileSync(
  path.join(ROOT, 'components/collabboard/canvas/ui/FreeformPadletCards.tsx'),
  'utf8',
);
const client = fs.readFileSync(
  path.join(ROOT, 'app/dashboard/canvas/[id]/CanvasClient.tsx'),
  'utf8',
);

/**
 * PATCH-370. A mounted render of the 6k-line canvas is impractical (see
 * FreeformPadletCards.researchDropZone.test.tsx), so this guards the wiring:
 * every NEW Freeform comment author goes through the ONE shared
 * `commentAuthorName` helper (PATCH-368's local helper is gone).
 */
describe('FreeformPadletCards guest comment author (PATCH-370)', () => {
  it('routes every comment author through the shared helper', () => {
    expect(cards).toContain('commentAuthorName');
    const uses = cards.match(/userName: commentAuthorName\(user, \{ hideGuestNames \}\)/g) ?? [];
    expect(uses).toHaveLength(9);
    // No comment-creation site still inlines the raw expression.
    expect(cards).not.toMatch(/userName: user\?\./);
  });

  it('takes the flag as a prop, passed from CanvasClient', () => {
    expect(cards).toContain('hideGuestNames?: boolean;');
    expect(cards).toContain('hideGuestNames = false,');
    expect(client).toContain('hideGuestNames={hideGuestNames}');
  });

  it('CanvasClient no longer contains inline currentUserName={user?. expressions', () => {
    expect(client).not.toContain('currentUserName={user?.');
    expect(client).toContain('currentUserName={commentAuthor}');
    expect(client).toContain('commentAuthorName(user, { hideGuestNames })');
  });
});
