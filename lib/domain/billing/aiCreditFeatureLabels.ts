/**
 * PATCH-344. One human label per metered AI feature, for the usage history.
 *
 * `Record<AiCreditFeature, string>` so a new feature fails to compile without a
 * label. Rows written by an older or newer build (a string the type does not
 * know) fall back to "AI feature".
 */
import { type AiCreditFeature } from './plans';

const FEATURE_LABELS: Record<AiCreditFeature, string> = {
  board_chat: 'Board AI chat',
  table_from_document: 'Table from document',
  wiki_compile: 'Wiki compile',
  text_action: 'Edit & rewrite',
  table_fill: 'Table fill',
  table_plan: 'Table plan',
  notes_to_cards: 'Suggest cards',
  transcript_punctuate: 'Readable transcript',
  component: 'AI card',
};

export function aiCreditFeatureLabel(feature: AiCreditFeature | string): string {
  return (FEATURE_LABELS as Record<string, string | undefined>)[feature] ?? 'AI feature';
}
