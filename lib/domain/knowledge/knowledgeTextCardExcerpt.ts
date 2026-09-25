/**
 * PATCH-181. How much of a text source a canvas card previews.
 *
 * A card is a preview, not a reader: enough to recognise the document and
 * decide whether to open it. Named here rather than in the card so the ROUTE
 * (which now serves the excerpt in its summary) and the card (which renders it)
 * cannot drift into two different "how much" values.
 */
export const KNOWLEDGE_TEXT_CARD_EXCERPT_CHARS = 600;
