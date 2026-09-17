// DeepSeek adapter -- the CollabBoard-default execution provider.
//
// SERVER ONLY.
//
// Wire-compatible with the existing callDeepSeek in
// app/api/ai/text-action/route.ts (same endpoint, same Bearer auth, same
// system+user message pair, same choices[0].message.content read), so routing
// that route through this adapter in a later phase is a swap, not a change in
// what DeepSeek receives. The one deliberate difference: no timer of its own.

import { chatCompletionsGenerateText } from './chatCompletions';
import type { AIGenerateTextInput, AIProviderAdapter } from './types';

export const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions';

/** The model the CollabBoard default resolves to today. */
export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-chat';

/**
 * The ONLY DeepSeek model that accepts image input. EXPERIMENTAL.
 *
 * `deepseek-chat` is text-only, so a request carrying an image part has to go
 * somewhere else. This is pinned as a single constant precisely because it is
 * experimental: when DeepSeek ships vision on the stable model, or withdraws
 * this one, the switch is this line and nothing else. Nothing in the codebase
 * may infer vision support from a model name -- see visionCapability.ts.
 */
export const DEEPSEEK_VISION_MODEL = 'deepseek-v4-flash-vision-exp';

export const deepSeekAdapter: AIProviderAdapter = {
  provider: 'deepseek',
  generateText(input: AIGenerateTextInput): Promise<string> {
    return chatCompletionsGenerateText('deepseek', DEEPSEEK_ENDPOINT, input);
  },
};
