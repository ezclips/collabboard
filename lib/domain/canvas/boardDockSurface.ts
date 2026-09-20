// The board's right-hand dock, and the rule that only one surface holds it.
//
// Pure, and separate from the shell for one reason: the defect this module
// exists to prevent was invisible in the shell. Board AI chat, the side-panel
// knowledge reader and the board wiki are all `fixed right-0` at z-[1200], and
// two open at once overlap -- at equal z-index the later one in the DOM wins.
// The guards that LOOKED like they prevented that governed only the floating
// launcher buttons, so from the outside the surfaces appeared mutually
// exclusive while nothing made them so.
//
// The rule used to be a set of named pairwise directions written into the
// shell's open paths. Two surfaces need two directions; three need six, and
// the third arrived with none of them. Stated as a claim instead, it is one
// sentence -- whoever takes the dock, the others give it up -- and a fourth
// surface costs one entry rather than a new direction per existing surface.

/** Every surface that can hold the dock. Adding one here is the whole change. */
export const BOARD_DOCK_SURFACES = ['chat', 'reader', 'wiki'] as const;

export type BoardDockSurface = (typeof BOARD_DOCK_SURFACES)[number];

/** Which surfaces must give up the dock when one is claimed. */
export interface BoardDockClaim {
  readonly closeChat: boolean;
  readonly closeWiki: boolean;
  readonly closeReader: boolean;
}

/**
 * What must close for `surface` to hold the dock alone.
 *
 * Derived from the surface rather than listed per case on purpose: a table of
 * three cases is a table someone extends to four by copying a row, and the row
 * they copy is the one that names every OTHER surface explicitly. That is the
 * shape that lost the wiki.
 */
export function boardDockClaim(surface: BoardDockSurface): BoardDockClaim {
  return {
    closeChat: surface !== 'chat',
    closeWiki: surface !== 'wiki',
    closeReader: surface !== 'reader',
  };
}
