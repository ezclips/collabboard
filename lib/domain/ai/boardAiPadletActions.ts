/**
 * PATCH-378. The ready-made Board AI actions on the five Padlet layouts.
 *
 * People should not have to invent the wording for "group these ideas into
 * columns by theme". Each action is a well-written prompt, and the board's own
 * layout supplies the noun: a Columns/Grid board groups into COLUMNS, a
 * Wall/Timeline/Map board into CARDS.
 *
 * The wording lives ONLY here -- the chip row, the `/` menu and the drawer all
 * read this list, so a prompt can never drift from the action it is named for.
 *
 * `kind` matters to the reader, not just to the model: `answer` produces a reply
 * with citations, `propose` produces a list with Apply/Discard (PATCH-372). Every
 * `propose` prompt says so out loud, because the model must never report an edit
 * it has not made.
 */

export interface LayoutNoun {
  /** One panel: 'column' on Columns/Grid, 'card' on Wall/Timeline/Map. */
  readonly one: string;
  readonly many: string;
}

export type BoardAiPadletActionKind = 'answer' | 'propose';

export interface BoardAiPadletAction {
  readonly id: string;
  /** The chip's own text, and what the `/` menu matches on. */
  readonly slash: string;
  readonly label: string;
  readonly kind: BoardAiPadletActionKind;
  /** The prompt sent (or inserted) for a board of the given noun. */
  readonly prompt: (noun: LayoutNoun) => string;
}

/**
 * PATCH-372's rule in plain words, on the end of every `propose` prompt: the
 * model PROPOSES, the person applies. Named so a test can hold every propose
 * action to it without restating the sentence.
 */
export const PROPOSE_DISCLAIMER = 'Propose these changes; do not claim they are already done.';

export const PADLET_BOARD_AI_ACTIONS: readonly BoardAiPadletAction[] = [
  {
    id: 'summarize',
    slash: '/summarize',
    label: 'Summarize',
    kind: 'answer',
    prompt: ({ one }) => `Summarize this board in a few short lines, one per ${one}, and cite the posts you used.`,
  },
  {
    id: 'group-by-theme',
    slash: '/group-by-theme',
    label: 'Group by theme',
    kind: 'propose',
    prompt: ({ many }) => `Group every post on this board into ${many} by theme. Create the ${many} you need and move the posts into them. ${PROPOSE_DISCLAIMER}`,
  },
  {
    id: 'next-steps',
    slash: '/next-steps',
    label: 'Next steps',
    kind: 'propose',
    prompt: ({ one }) => `Derive concrete next steps from what is on this board and put them in a new "Next steps" ${one}. ${PROPOSE_DISCLAIMER}`,
  },
  {
    id: 'more-ideas',
    slash: '/more-ideas',
    label: 'More ideas',
    kind: 'propose',
    prompt: ({ one }) => `Suggest two or three NEW ideas per ${one} that are not already on this board, and say which ${one} each belongs to. ${PROPOSE_DISCLAIMER}`,
  },
  {
    id: 'duplicates',
    slash: '/duplicates',
    label: 'Find duplicates',
    kind: 'answer',
    prompt: () => 'List the posts on this board that say the same thing, grouped together, and cite each one. Do not propose deleting anything.',
  },
  {
    id: 'open-questions',
    slash: '/open-questions',
    label: 'Open questions',
    kind: 'answer',
    prompt: () => 'What on this board is still unclear or undecided? List the open questions and cite the posts they come from.',
  },
  {
    id: 'retro',
    slash: '/retro',
    label: 'Retro',
    kind: 'propose',
    prompt: ({ many }) => `Sort this board into three ${many}: "Went well", "To improve" and "Actions". Create the ${many} that do not exist yet and move the posts into them. ${PROPOSE_DISCLAIMER}`,
  },
];

/** The noun a board's own layout uses. Anything but Columns/Grid groups cards. */
export function layoutNounFor(layout: string | null | undefined): LayoutNoun {
  return layout === 'columns' || layout === 'grid'
    ? { one: 'column', many: 'columns' }
    : { one: 'card', many: 'cards' };
}

/**
 * The actions offered on this layout.
 *
 * A Map post is a place on the globe rather than a spot in a viewport, so
 * grouping and moving posts makes no sense there: Map gets the `answer` actions
 * only. PATCH-380 reuses that same rule for a GUEST on any layout -- a guest may
 * ask questions, never restructure the board.
 */
export function actionsForLayout(
  layout: string | null | undefined,
  options?: { readonly answerOnly?: boolean },
): readonly BoardAiPadletAction[] {
  if (options?.answerOnly === true || layout === 'map') {
    return PADLET_BOARD_AI_ACTIONS.filter((action) => action.kind === 'answer');
  }
  return PADLET_BOARD_AI_ACTIONS;
}
