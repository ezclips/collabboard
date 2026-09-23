import { describe, expect, it } from 'vitest';

import {
  BOARD_AI_STARTER_QUESTION_MAX_CHARS,
  parseStarterQuestions,
} from './boardAiStarterQuestions';

/**
 * A SUGGESTION THAT CANNOT BE MADE YIELDS NOTHING, NEVER AN ERROR.
 *
 * The model is asked for three questions and may return prose, an apology or
 * nothing. Every one of those is `[]`. The panel shows no suggestion UI at all
 * in that case, so an absence must be indistinguishable from "not asked yet".
 */
describe('parseStarterQuestions', () => {
  it('returns plain question lines as they are', () => {
    expect(parseStarterQuestions('What is the main claim?\nWhy does it matter?\nWho is it for?'))
      .toEqual(['What is the main claim?', 'Why does it matter?', 'Who is it for?']);
  });

  it('cleans numbered lines, in every marker shape', () => {
    const raw = '1. What is the main claim?\n2) Why does it matter?\n3: Who is it for?';
    expect(parseStarterQuestions(raw))
      .toEqual(['What is the main claim?', 'Why does it matter?', 'Who is it for?']);
  });

  it('cleans bulleted lines', () => {
    expect(parseStarterQuestions('- What is the main claim?\n* Why does it matter?\n• Who is it for?'))
      .toEqual(['What is the main claim?', 'Why does it matter?', 'Who is it for?']);
  });

  it('cleans lines the model wrapped in quotes', () => {
    expect(parseStarterQuestions('"What is the main claim?"\n\'Why does it matter?\''))
      .toEqual(['What is the main claim?', 'Why does it matter?']);
  });

  it('strips furniture and quotes together', () => {
    expect(parseStarterQuestions('1. "What is the main claim?"')).toEqual(['What is the main claim?']);
  });

  it('drops lines that are not questions', () => {
    // A preamble, a heading and prose all lack the `?` and are dropped.
    const raw = 'Here are three questions:\nWhat is the main claim?\nThis one is a statement.\nWhy?';
    expect(parseStarterQuestions(raw)).toEqual(['What is the main claim?', 'Why?']);
  });

  it('drops an over-long line', () => {
    const long = `${'a'.repeat(BOARD_AI_STARTER_QUESTION_MAX_CHARS)}?`;
    const ok = 'Is this short enough?';
    expect(parseStarterQuestions(`${long}\n${ok}`)).toEqual([ok]);
    // And exactly at the limit is kept, so the bound is a bound and not a guess.
    const atLimit = `${'a'.repeat(BOARD_AI_STARTER_QUESTION_MAX_CHARS - 1)}?`;
    expect(parseStarterQuestions(atLimit)).toEqual([atLimit]);
  });

  it('dedupes case-insensitively, keeping the first', () => {
    expect(parseStarterQuestions('What is the claim?\nwhat is the claim?\nWhy does it matter?'))
      .toEqual(['What is the claim?', 'Why does it matter?']);
  });

  it('returns AT MOST three, even when the model writes more', () => {
    const raw = ['One?', 'Two?', 'Three?', 'Four?', 'Five?'].join('\n');
    expect(parseStarterQuestions(raw)).toEqual(['One?', 'Two?', 'Three?']);
  });

  it('ignores blank lines and whitespace-only lines', () => {
    expect(parseStarterQuestions('\n  \nWhat is the claim?\n\n')).toEqual(['What is the claim?']);
  });

  it('yields [] for prose, an apology, an empty string or a non-string', () => {
    for (const raw of [
      'I am sorry, I cannot help with that.',
      'The document discusses several topics at length.',
      '',
      '   \n  \n',
      '1.\n2.\n3.',
    ]) {
      expect(parseStarterQuestions(raw), JSON.stringify(raw)).toEqual([]);
    }
  });
});
