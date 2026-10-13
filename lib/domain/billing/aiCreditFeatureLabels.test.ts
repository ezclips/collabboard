import { describe, expect, it } from 'vitest';
import { AI_CREDIT_COSTS } from './plans';
import { aiCreditFeatureLabel } from './aiCreditFeatureLabels';

describe('PATCH-344 aiCreditFeatureLabel', () => {
  it('has a non-empty label for every metered feature', () => {
    for (const feature of Object.keys(AI_CREDIT_COSTS)) {
      expect(aiCreditFeatureLabel(feature), feature).toBeTruthy();
    }
  });

  it('names the known features', () => {
    expect(aiCreditFeatureLabel('board_chat')).toBe('Board AI chat');
    expect(aiCreditFeatureLabel('notes_to_cards')).toBe('Suggest cards');
    expect(aiCreditFeatureLabel('component')).toBe('AI card');
    expect(aiCreditFeatureLabel('board_setup')).toBe('Board setup');
  });

  it('falls back to "AI feature" for an unknown string', () => {
    expect(aiCreditFeatureLabel('some_future_feature')).toBe('AI feature');
  });
});
