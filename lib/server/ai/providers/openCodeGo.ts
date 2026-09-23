// OpenCode Go adapter.
//
// SERVER ONLY.
//
// OpenCode Go speaks Chat Completions at ONE fixed endpoint, which the official
// docs publish. The base URL is a constant here and is never user-supplied: a
// configurable endpoint is an SSRF surface, which is exactly why the provider
// list is closed and why this adapter adds no such field. The user supplies a
// key and a model id, like every other provider.
//
// TEXT-ONLY, BY DECLARATION. carriesImages is false, so no image is ever placed
// on this wire. One model on the endpoint can read an image; claiming the
// capability for the PROVIDER would let the image checkbox send private PDF
// crops to every other model there, which cannot read them. A capability is a
// property of the adapter's wire format (this file) AND the model declaration
// (the user's, in Settings) -- the two are independent and both must hold.
//
// WHY IT STILL REFUSES IMAGES RATHER THAN IGNORING THEM. The shared helper
// would happily build image_url parts, so a text-only adapter that dropped them
// would answer from text alone while the user believes the model looked at
// their image -- a wrong answer that reads like a right one. The contract in
// types.ts says an adapter that cannot carry images MUST throw, and that is
// what this one does.

import { chatCompletionsGenerateText } from './chatCompletions';
import { aiProviderInvalidConfiguration } from './errors';
import type { AIGenerateTextInput, AIProviderAdapter } from './types';

/**
 * The fixed endpoint, from https://opencode.ai/docs/go/.
 *
 * Serves the chat-completions family: GLM-5.x, Kimi K3/K2.x, DeepSeek V4.1
 * Flash / V4 Pro / V4 Flash, MiMo, Qwen3.8 Flash. Other OpenCode Go models
 * (MiniMax, Qwen Max/Plus on /v1/messages; Grok, GPT on /v1/responses) are NOT
 * reachable through this adapter and will fail at the provider. The model id
 * stays opaque, as the contract requires -- no allow-list, no sniffing.
 */
export const OPENCODE_GO_ENDPOINT = 'https://opencode.ai/zen/go/v1/chat/completions';

export const openCodeGoAdapter: AIProviderAdapter = {
  provider: 'opencode-go',
  // Text-only. See the header: this is a property of the adapter's wire format,
  // and it is false because the endpoint's capability is not uniform.
  carriesImages: false,
  generateText(input: AIGenerateTextInput): Promise<string> {
    // `reasoning` is deliberately IGNORED here: no switch for this provider was
    // measured, and an unmeasured parameter is a guess. Sending nothing keeps
    // this request exactly as it was.
    // A non-empty images array is REFUSED, never dropped. Declaring false above
    // is what keeps this from being reached on the normal path; this check is
    // the honest failure for any path that reaches it anyway.
    if (input.images && input.images.length > 0) {
      throw aiProviderInvalidConfiguration('opencode-go');
    }
    return chatCompletionsGenerateText('opencode-go', OPENCODE_GO_ENDPOINT, input);
  },
};
