// KNI-R4. Shared contract for the selected-text AI action, kept separate from
// lib/ai/contracts.ts's structured-component AIMode -- this is plain-text
// transformation only, never a component-generation request.

export type TextAction = 'improve' | 'shorten' | 'fix-grammar' | 'custom';

export const TEXT_ACTIONS: TextAction[] = ['improve', 'shorten', 'fix-grammar', 'custom'];

export const TEXT_ACTION_LABELS: Record<TextAction, string> = {
  improve: 'Improve writing',
  shorten: 'Shorten',
  'fix-grammar': 'Fix grammar',
  custom: 'Custom instruction',
};

export function isTextAction(value: unknown): value is TextAction {
  return typeof value === 'string' && (TEXT_ACTIONS as string[]).includes(value);
}

export const TEXT_ACTION_SELECTED_TEXT_MAX = 4000;
export const TEXT_ACTION_INSTRUCTION_MAX = 1000;

export interface TextActionRequest {
  action: TextAction;
  selectedText: string;
  instruction?: string;
}

export interface TextActionResponse {
  text: string;
}
