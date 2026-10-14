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
 * PATCH-368. A mounted render of the 6k-line canvas is impractical (see
 * FreeformPadletCards.researchDropZone.test.tsx), so this guards the wiring:
 * every NEW Freeform comment author goes through one helper that swaps in the
 * guest alias while names are hidden.
 */
describe('FreeformPadletCards guest comment author (PATCH-368)', () => {
  it('routes every comment author through one helper', () => {
    expect(cards).toContain('guestAlias');
    expect(cards).toMatch(/const commentAuthorName = React\.useCallback\(\(base: string\)/);
    // Nine comment-creation sites, all through the helper.
    const uses = cards.match(/userName: commentAuthorName\(/g) ?? [];
    expect(uses).toHaveLength(9);
    // No comment-creation site still inlines the raw expression.
    expect(cards).not.toMatch(/userName: user\?\./);
  });

  it('swaps in the alias only for a guest while names are hidden', () => {
    const helper = cards.slice(
      cards.indexOf('const commentAuthorName'),
      cards.indexOf('}, [hideGuestNames, user]);'),
    );
    expect(helper).toContain('hideGuestNames && isGuest && user?.id ? guestAlias(user.id) : base');
    expect(helper).toContain('is_anonymous');
  });

  it('takes the flag as a prop, passed from CanvasClient', () => {
    expect(cards).toContain('hideGuestNames?: boolean;');
    expect(cards).toContain('hideGuestNames = false,');
    expect(client).toContain('hideGuestNames={hideGuestNames}');
  });
});
