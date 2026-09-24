/**
 * PATCH-178. The instructions the Readable transcript feature sends to the
 * model.
 *
 * THE INSTRUCTION IS A REQUEST, NOT THE GUARANTEE. It asks the model to add
 * punctuation without touching the words -- but the guarantee is
 * `projectTranscriptPunctuation`, which discards the model's text and rebuilds
 * the output from the original words. The retry instruction below only makes
 * the request more explicit; it does not weaken that rule.
 *
 * Kept in the DOMAIN rather than in the component: the route owns the retry, so
 * the instruction a retry uses is server-side policy, not UI copy.
 */

/** The instruction for a normal punctuation pass. Moved verbatim from the reader. */
export const TRANSCRIPT_PUNCTUATE_INSTRUCTION = 'Add only punctuation (periods, commas, question marks, '
  + 'exclamation marks, semicolons, colons, em dashes), capitalisation, and apostrophes or hyphens '
  + 'within words (for example "kings" may become "king\'s" and "setup based" may become '
  + '"setup-based"). Do not add, remove, reorder, merge or split any word. Return only the '
  + 'punctuated text, with no preamble, commentary or quotation.';

/**
 * The instruction for the ONE retry of a refused passage.
 *
 * A refusal means the model changed a word -- on the chess transcript it
 * "corrected" the caption's "night" to "knight". The extra sentence names that
 * exact failure, so the second attempt is told not to repeat it.
 */
export const TRANSCRIPT_PUNCTUATE_RETRY_INSTRUCTION = `${TRANSCRIPT_PUNCTUATE_INSTRUCTION} `
  + 'Keep every word exactly as written, even when it looks misheard or misspelled (for example, '
  + 'keep "night" even if "knight" was meant); a wrong-looking word must stay wrong.';
