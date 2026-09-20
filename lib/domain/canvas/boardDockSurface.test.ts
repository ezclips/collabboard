import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  BOARD_DOCK_SURFACES,
  boardDockClaim,
  type BoardDockSurface,
} from './boardDockSurface';

/**
 * The dock rule, and its wiring into the shell.
 *
 * The first group is the rule as BEHAVIOUR, which is the point of extracting
 * it: the defect it fixes lived for two units behind source-level pins that
 * asserted the launcher buttons were mutually exclusive. They were. The
 * drawers were not, and no assertion was looking at the drawers.
 *
 * The second group is the wiring, which can only be read out of the shell --
 * so it is read deliberately, path by path, with each path named.
 */

const shellSource = readFileSync(
  path.join(process.cwd(), 'app/dashboard/canvas/[id]/CanvasClient.tsx'), 'utf8');

/** The shell with comments removed: a rule explained is not a rule applied. */
const shellCode = shellSource
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const closedBy = (claim: ReturnType<typeof boardDockClaim>) =>
  [claim.closeChat && 'chat', claim.closeReader && 'reader', claim.closeWiki && 'wiki']
    .filter(Boolean) as BoardDockSurface[];

describe('whoever claims the dock holds it alone', () => {
  it.each(BOARD_DOCK_SURFACES)('%s closes every other surface', (surface) => {
    const others = BOARD_DOCK_SURFACES.filter((candidate) => candidate !== surface);
    expect(closedBy(boardDockClaim(surface)).sort()).toEqual([...others].sort());
  });

  it.each(BOARD_DOCK_SURFACES)('%s does not close itself', (surface) => {
    expect(closedBy(boardDockClaim(surface))).not.toContain(surface);
  });

  it('never leaves two surfaces holding the dock, for any claim', () => {
    for (const surface of BOARD_DOCK_SURFACES) {
      // Exactly one survives a claim: the claimant. Stated as a count so a
      // fourth surface that the rule forgets fails here rather than in a
      // screenshot.
      expect(BOARD_DOCK_SURFACES.length - closedBy(boardDockClaim(surface)).length).toBe(1);
    }
  });

  it('COVERS EVERY SURFACE THE SHELL CAN OPEN', () => {
    // The enumeration is the contract. A fourth dock surface added to the
    // shell without an entry here is the exact mistake the wiki made.
    expect([...BOARD_DOCK_SURFACES].sort()).toEqual(['chat', 'reader', 'wiki']);
  });
});

describe('every path that opens a dock surface claims it', () => {
  /**
   * The body of a named useCallback, comments stripped, bounded at its own
   * dependency array. Bounding matters: a fixed-width window ran past
   * `toggleBoardAiChat` into `closeBoardAiChat` and read that legitimate
   * closer as a hand-written sibling close.
   */
  function callbackBody(name: string): string {
    const start = shellCode.indexOf(`const ${name} = useCallback(`);
    expect(start, `${name} not found in the shell`).toBeGreaterThan(-1);
    const rest = shellCode.slice(start);
    const end = rest.search(/\n  \}, \[/);
    expect(end, `${name} has no dependency array`).toBeGreaterThan(-1);
    return rest.slice(0, end);
  }

  it.each([
    ['toggleBoardAiChat', 'chat'],
    ['openBoardWiki', 'wiki'],
    // The reader has THREE open paths and direction B was only ever written
    // on two of them. requestKnowledgeSourceOpen -- a card's source marker,
    // the Note editor's "Source - p. N" -- had no dock rule at all.
    ['requestKnowledgeSourceOpen', 'reader'],
    ['requestKnowledgeDocumentOpen', 'reader'],
    ['registerPdfWorkspaceDocument', 'reader'],
  ])('%s claims the dock as %s', (name, surface) => {
    expect(callbackBody(name)).toContain(`claimDock('${surface}')`);
  });

  it('THE WIKI OPENS FROM ONE PLACE ONLY', () => {
    // Two open sites is how a surface acquires the rule in one of them and
    // not the other. The launcher calls openBoardWiki; nothing else sets the
    // flag true.
    const opens = shellCode.match(/setIsBoardWikiOpen\(true\)/g) ?? [];
    expect(opens).toHaveLength(1);
    expect(callbackBody('openBoardWiki')).toContain('setIsBoardWikiOpen(true)');
    expect(shellCode).toContain('onClick={openBoardWiki}');
  });

  it('CHAT OPENS FROM ONE PLACE ONLY', () => {
    const opens = shellCode.match(/setIsBoardAiChatOpen\(true\)/g) ?? [];
    expect(opens).toHaveLength(1);
    expect(callbackBody('toggleBoardAiChat')).toContain('setIsBoardAiChatOpen(true)');
  });

  it.each([
    ['toggleBoardAiChat', ['setIsBoardWikiOpen(false)', 'setCloseSidePanelRequestId']],
    ['openBoardWiki', ['setIsBoardAiChatOpen(false)', 'setCloseSidePanelRequestId']],
    ['requestKnowledgeSourceOpen', ['setIsBoardAiChatOpen(false)', 'setIsBoardWikiOpen(false)']],
    ['requestKnowledgeDocumentOpen', ['setIsBoardAiChatOpen(false)', 'setIsBoardWikiOpen(false)']],
    ['registerPdfWorkspaceDocument', ['setIsBoardAiChatOpen(false)', 'setIsBoardWikiOpen(false)']],
  ])('%s closes no SIBLING by hand', (name, forbidden) => {
    // The pairwise directions are gone, not merely supplemented. A surviving
    // hand-written close beside a claim is a second rule free to disagree with
    // the first -- which is exactly how the reader path came to close Chat and
    // ignore the wiki. Closing ITSELF is allowed: that is what a toggle does.
    const body = callbackBody(name);
    for (const call of forbidden) expect(body).not.toContain(call);
  });

  it('the shell reads the rule instead of restating it', () => {
    expect(shellCode).toContain("from '@/lib/domain/canvas/boardDockSurface'");
    expect(shellCode).toContain('boardDockClaim(surface)');
    // The inline form the extraction replaced.
    expect(shellCode).not.toContain("if (surface !== 'chat')");
  });
});
