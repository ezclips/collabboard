/**
 * The one-sentence message an AI table feature shows above its proposal.
 *
 * SHORTENED, NEVER A REASON TO REFUSE. Found live on 2026-09-24: a correct
 * 22-row table from a PDF was thrown away because the model's sentence ran past
 * 200 characters. The message is only prose above the proposal -- the table or
 * plan is what gets checked -- so an over-long one is cut, not rejected. The
 * 2,000-character ceiling still refuses a body that is not a sentence at all.
 */

import { z } from 'zod';

export const AI_SHORT_MESSAGE_MAX_CHARS = 200;

export const aiShortMessageSchema = z
  .string()
  .max(2000)
  .transform((text) => (
    text.length <= AI_SHORT_MESSAGE_MAX_CHARS
      ? text
      : `${text.slice(0, AI_SHORT_MESSAGE_MAX_CHARS - 1).trimEnd()}…`
  ));
