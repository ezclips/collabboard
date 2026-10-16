import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PATCH-300. The two floating board assistant buttons were gated on ONE flag,
 * and that flag kept them on freeform boards only. The drawers stay mounted
 * everywhere -- only these two launchers move -- so the gate lives on the
 * button conditions, read here out of the host rather than counted.
 *
 * PATCH-375. The Board AI launcher is no longer freeform-only: it is now the
 * entry point on the five Padlet layouts too, so it has its own flag. The WIKI
 * launcher below still rides the freeform-only one.
 */
const CLIENT = fs.readFileSync(
  path.join(process.cwd(), 'app/dashboard/canvas/[id]/CanvasClient.tsx'), 'utf8');

function conditionBefore(marker: string): string {
  const at = CLIENT.indexOf(marker);
  expect(at, `${marker} not found`).toBeGreaterThan(-1);
  return CLIENT.slice(CLIENT.lastIndexOf('{', at), at);
}

describe('PATCH-300 board assistant buttons are freeform-only', () => {
  it('defines the flag as a loaded freeform board, not the layout fallback alone', () => {
    // Not isFreeformLayout by itself: that flag is also true while `canvas` is
    // still null, which would flash the buttons on every board during load.
    expect(CLIENT).toContain('const showBoardAssistantButtons = !!canvas && isFreeformLayout;');
  });

  it('gates the wiki launcher on the flag', () => {
    expect(conditionBefore('data-board-wiki-open="true"')).toContain('showBoardAssistantButtons &&');
  });

  it('gates the Board AI launcher on its own flag, which covers the five too', () => {
    // PATCH-375. The freeform flag is still a term of it -- so this button is
    // still offered on a freeform board -- but it is no longer the whole gate.
    expect(conditionBefore('data-board-ai-chat-open="true"')).toContain('showBoardAiLauncher &&');
    expect(CLIENT).toContain('const showBoardAiLauncher = enableBoardAiChat');
    // PATCH-380. The five are added, and a guest gets it only when the owner
    // allowed Board AI for guests.
    expect(CLIENT).toContain('(isPadletBoardAiLayout && (!isGuestUser || guestAiAllowed))');
  });
});
