/**
 * The PDF reader's ONE compact control shape.
 *
 * It was the bottom toolbar's private constant, which is exactly how the
 * header's Library and AI controls came to be near-misses of it: same rough
 * size, different border, radius, weight and hover. Extracted here so both
 * ends of the reader draw from one string -- change it once and every compact
 * PDF control changes with it.
 *
 * The shape is fixed. Active state is a TINT over it (below), never a
 * different size, radius or padding: a control that changes shape when it
 * turns on reads as a different control.
 */
export const KNOWLEDGE_ICON_BUTTON_CLASS =
  'inline-flex h-6 w-6 flex-none shrink-0 items-center justify-center rounded border border-gray-200 '
  + 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 '
  + 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-400 '
  + 'disabled:cursor-not-allowed disabled:opacity-40';

/** The icon size every compact control carries. */
export const KNOWLEDGE_ICON_SIZE_CLASS = 'h-3.5 w-3.5';

/**
 * The active tints, in each surface's own colour: blue is the reader's
 * existing "this control is on" (search, Select area), and purple is Board
 * AI's, the same purple the AI panel uses.
 */
export const KNOWLEDGE_CONTROL_ACTIVE_BLUE = ' border-blue-300 bg-blue-50 text-blue-700';
export const KNOWLEDGE_CONTROL_ACTIVE_PURPLE = ' border-purple-300 bg-purple-50 text-purple-700';
