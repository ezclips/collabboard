import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PATCH-300. Both floating board assistant buttons are gated on ONE flag, and
 * that flag keeps them on freeform boards only. The drawers stay mounted
 * everywhere -- only these two launchers move -- so the gate lives on the
 * button conditions, read here out of the host rather than counted.
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

  it('gates the Board AI launcher on the flag', () => {
    expect(conditionBefore('data-board-ai-chat-open="true"')).toContain('showBoardAssistantButtons &&');
  });
});
