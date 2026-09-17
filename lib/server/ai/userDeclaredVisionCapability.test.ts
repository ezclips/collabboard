import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * USER-DECLARED VISION CAPABILITY.
 *
 * The feature is one sentence: a BYOK user can say "this model of mine accepts
 * images", and Board AI then uses THEIR model instead of refusing. Everything
 * here defends the two halves that make that safe --
 *
 *   the declaration is a DECLARATION (nobody, including this codebase, guesses
 *   it from a model id), and
 *
 *   an image is only ever sent when BOTH the adapter can carry one and the
 *   model was declared able to read one.
 *
 * The wire shapes below are pinned against the PUBLISHED request formats, cited
 * beside each. They are the half that cannot be caught by types: a wrong part
 * name is a 400 at runtime that reads like a provider outage.
 */

const ROOT = resolve(__dirname, '../../..');
const MIGRATION = resolve(ROOT, 'supabase/migrations/20260916180000_ai_connection_supports_images.sql');
const migrationSql = readFileSync(MIGRATION, 'utf8');
/** Executable SQL only: the header explains the rule in prose at length. */
const executableSql = migrationSql.replace(/--[^\n]*/g, '');

import {
  aiProviderConnectionInputSchema,
  aiProviderTypeCarriesImages,
  AI_PROVIDER_TYPES,
  IMAGE_CAPABLE_PROVIDER_TYPES,
} from '../../domain/settings/aiProviderConnection';
import { SAFE_CONNECTION_COLUMNS } from '../../infra/settings/aiProviderCredentialRepository';
import { anthropicAdapter } from './providers/anthropic';
import { deepSeekAdapter, DEEPSEEK_DEFAULT_MODEL } from './providers/deepSeek';
import { geminiAdapter } from './providers/gemini';
import { openAIAdapter } from './providers/openAI';
import { openRouterAdapter } from './providers/openRouter';
import { getAIProviderAdapter } from './providers/registry';
import { adapterCarriesImages } from './providers/visionCapability';
import { AI_EXECUTION_PROVIDERS, type AIExecutionProvider } from './providers/types';
import { COLLABBOARD_DEFAULT_MODEL } from '../../../components/settings/ai/aiSettingsClient';

const IMAGE = { mediaType: 'image/webp', base64: 'QUJD' };
const BASE = {
  model: 'the-model', apiKey: 'FAKE-KEY-DO-NOT-LEAK', system: 'SYS', user: 'USER', maxTokens: 10,
};

/** Captures the outgoing body. A 500 reply keeps every adapter on one path. */
function captureBody(): { body: () => Record<string, unknown> } {
  const spy = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response('{}', { status: 500 }));
  return {
    body: () => JSON.parse(String((spy.mock.calls[0][1] as { body: string }).body)),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('T1. the column, and the read that must return it', () => {
  it('1. is added NOT NULL with a false default', () => {
    expect(executableSql).toMatch(
      /ADD COLUMN IF NOT EXISTS supports_images boolean NOT NULL DEFAULT false/,
    );
    expect(executableSql).toContain('ALTER TABLE public.ai_provider_connections');
  });

  it('2. false is the default, so no existing connection is switched on by the migration', () => {
    // The whole safety posture in one assertion: there is no UPDATE, no
    // backfill to true, and nothing conditional on a model id anywhere.
    expect(executableSql).not.toMatch(/UPDATE\s+public\.ai_provider_connections/i);
    expect(executableSql).not.toMatch(/DEFAULT\s+true/i);
    expect(executableSql).not.toMatch(/supports_images\s*=\s*true/i);
  });

  it('3. the column is in the ONE projection every read uses', () => {
    // A column the UI can write but the read drops is the exact defect the
    // SAFE_CONNECTION_COLUMNS constant exists to prevent.
    expect(SAFE_CONNECTION_COLUMNS).toContain('supports_images');
  });

  it('4. the atomic create carries it, and the old overload is dropped', () => {
    // Creation does not go through the repository -- it goes through the
    // function. A 6-argument overload left in place would still resolve, and
    // the one it resolves to is the one that discards the declaration.
    expect(executableSql).toMatch(/p_supports_images boolean/);
    expect(executableSql).toMatch(
      /DROP FUNCTION IF EXISTS public\.create_ai_provider_connection_atomic\(\s*uuid, text, text, text, text, text\s*\)/,
    );
    // And the lockdown is re-applied to the NEW signature, not left on the
    // dropped one: a fresh function is granted to PUBLIC by default.
    expect(executableSql).toMatch(/REVOKE EXECUTE[\s\S]*?uuid, text, text, text, text, text, boolean[\s\S]*?FROM PUBLIC/);
    expect(executableSql).toMatch(/GRANT EXECUTE[\s\S]*?uuid, text, text, text, text, text, boolean[\s\S]*?TO service_role/);
  });

  it('5. grants execute to nobody but service_role', () => {
    expect(executableSql).toMatch(/FROM anon/);
    expect(executableSql).toMatch(/FROM authenticated/);
    const grants = [...executableSql.matchAll(/GRANT EXECUTE[\s\S]*?TO (\w+)/g)].map((m) => m[1]);
    expect(new Set(grants)).toEqual(new Set(['service_role']));
  });
});

describe('T2. the schema default', () => {
  it('6. absent means false, never undefined', () => {
    const parsed = aiProviderConnectionInputSchema.parse({
      providerType: 'openai', displayName: 'Work', defaultModel: 'gpt-5',
    });
    expect(parsed.supportsImages).toBe(false);
  });

  it('7. an explicit value is preserved in both directions', () => {
    const base = { providerType: 'openai' as const, displayName: 'Work', defaultModel: 'gpt-5' };
    expect(aiProviderConnectionInputSchema.parse({ ...base, supportsImages: true }).supportsImages)
      .toBe(true);
    expect(aiProviderConnectionInputSchema.parse({ ...base, supportsImages: false }).supportsImages)
      .toBe(false);
  });

  it('8. a non-boolean is rejected rather than coerced', () => {
    // "false" and 0 are the two values that would quietly become the WRONG
    // boolean under coercion, and one of them would switch images ON.
    for (const value of ['true', 'false', 1, 0, null]) {
      const result = aiProviderConnectionInputSchema.safeParse({
        providerType: 'openai', displayName: 'Work', defaultModel: 'gpt-5', supportsImages: value,
      });
      expect(result.success, JSON.stringify(value)).toBe(false);
    }
  });
});

describe('T4. adapter declarations', () => {
  it('9. every adapter states its image capability explicitly', () => {
    const declared: Record<string, boolean> = {
      deepseek: deepSeekAdapter.carriesImages,
      openai: openAIAdapter.carriesImages,
      anthropic: anthropicAdapter.carriesImages,
      gemini: geminiAdapter.carriesImages,
      openrouter: openRouterAdapter.carriesImages,
    };
    // PINNED. All five carry images as of this unit -- Gemini included, because
    // its Interactions image shape was confirmed from Google's own docs rather
    // than guessed. A provider that loses its image path must flip this
    // deliberately, not by deleting a line.
    expect(declared).toEqual({
      deepseek: true, openai: true, anthropic: true, gemini: true, openrouter: true,
    });
    // Booleans, never undefined: an adapter added without the property would
    // otherwise inherit a falsy "no" by silence, which is a refusal nobody
    // wrote down.
    for (const provider of AI_EXECUTION_PROVIDERS) {
      expect(typeof getAIProviderAdapter(provider).carriesImages, provider).toBe('boolean');
    }
  });

  it('10. the capability helper reads the adapter, not a second list', () => {
    for (const provider of AI_EXECUTION_PROVIDERS) {
      expect(adapterCarriesImages(provider as AIExecutionProvider), provider)
        .toBe(getAIProviderAdapter(provider).carriesImages);
    }
  });

  it('11. the client-safe mirror agrees with the adapters exactly', () => {
    // The Settings UI cannot import an adapter (they all handle a plaintext
    // key), so the fact is restated in the domain layer. This is the binding
    // that stops the two from drifting -- a provider wired on the server but
    // missing from the mirror would render a checkbox that cannot be ticked,
    // and the reverse would offer one that fails at execution.
    for (const providerType of AI_PROVIDER_TYPES) {
      expect(aiProviderTypeCarriesImages(providerType), providerType)
        .toBe(getAIProviderAdapter(providerType).carriesImages);
    }
    expect([...IMAGE_CAPABLE_PROVIDER_TYPES].sort()).toEqual([...AI_PROVIDER_TYPES].sort());
  });
});

describe('T5. the OpenAI wire shape', () => {
  // https://developers.openai.com/api/docs/guides/images-vision
  it('12. an image becomes input_text + input_image on a user item', async () => {
    const { body } = captureBody();
    await expect(openAIAdapter.generateText({ ...BASE, images: [IMAGE] })).rejects.toThrow();

    expect(body().input).toEqual([
      {
        role: 'user',
        content: [
          { type: 'input_text', text: 'USER' },
          // image_url is a PLAIN STRING here. Chat Completions takes an object
          // at the same key; the Responses API does not, and sending the
          // object form is a 400.
          { type: 'input_image', image_url: 'data:image/webp;base64,QUJD' },
        ],
      },
    ]);
    // Responses semantics are untouched by the image path.
    expect(body().instructions).toBe('SYS');
    expect(body().max_output_tokens).toBe(10);
    expect(body()).not.toHaveProperty('messages');
    // Never a link: the source is a private crop with no public address.
    expect(JSON.stringify(body())).not.toContain('http');
  });

  it('13. with no image the input is the plain string, exactly as before', async () => {
    const { body } = captureBody();
    await expect(openAIAdapter.generateText(BASE)).rejects.toThrow();

    expect(body().input).toBe('USER');
    expect(Object.keys(body()).sort())
      .toEqual(['input', 'instructions', 'max_output_tokens', 'model']);
  });
});

describe('T6. the Anthropic wire shape', () => {
  // https://platform.claude.com/docs/en/docs/build-with-claude/vision
  it('14. an image becomes a base64 image block in the user turn', async () => {
    const { body } = captureBody();
    await expect(anthropicAdapter.generateText({ ...BASE, images: [IMAGE] })).rejects.toThrow();

    const messages = body().messages as { role: string; content: unknown }[];
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toEqual([
      // Image FIRST: the same documentation recommends an image-then-text
      // structure, and our text half is a large JSON payload.
      {
        type: 'image',
        source: { type: 'base64', media_type: 'image/webp', data: 'QUJD' },
      },
      { type: 'text', text: 'USER' },
    ]);
    // webp needs no conversion: Anthropic accepts jpeg, png, gif and webp.
    expect(JSON.stringify(body())).toContain('image/webp');
    // system stays a TOP-LEVEL field and never becomes a turn.
    expect(body().system).toBe('SYS');
    expect(JSON.stringify(body())).not.toContain('http');
  });

  it('15. with no image the content is the plain string, exactly as before', async () => {
    const { body } = captureBody();
    await expect(anthropicAdapter.generateText(BASE)).rejects.toThrow();

    expect(body().messages).toEqual([{ role: 'user', content: 'USER' }]);
  });
});

describe('T4 (2d). the Gemini wire shape -- Interactions, not generateContent', () => {
  // https://ai.google.dev/gemini-api/docs/interactions/image-understanding
  it('16. an image becomes a typed part with data + mime_type', async () => {
    const { body } = captureBody();
    await expect(geminiAdapter.generateText({ ...BASE, images: [IMAGE] })).rejects.toThrow();

    expect(body().input).toEqual([
      { type: 'text', text: 'USER' },
      { type: 'image', data: 'QUJD', mime_type: 'image/webp' },
    ]);
    // THE MISTAKE THIS PINS. generateContent nests `inline_data` inside
    // `contents[].parts[]`; the Interactions API takes neither. Either spelling
    // against this endpoint is a 400 that looks like a provider outage.
    const serialized = JSON.stringify(body());
    expect(serialized).not.toContain('inline_data');
    expect(serialized).not.toContain('inlineData');
    expect(serialized).not.toContain('parts');
    expect(serialized).not.toContain('contents');
    // Raw base64 with a sibling type, NOT a data: URL.
    expect(serialized).not.toContain('data:image');
    expect(body().system_instruction).toBe('SYS');
  });

  it('17. with no image the input is the plain string, exactly as before', async () => {
    const { body } = captureBody();
    await expect(geminiAdapter.generateText(BASE)).rejects.toThrow();

    expect(body().input).toBe('USER');
  });
});

describe('T8. the retired default model', () => {
  it('18. the UI names the same model the server actually calls', () => {
    // These are two constants in two bundles -- the adapter is server-only and
    // the settings client is 'use client', so the value is restated rather than
    // imported. A drift here is a UI that tells the user one model answered
    // while another did.
    expect(COLLABBOARD_DEFAULT_MODEL).toBe(DEEPSEEK_DEFAULT_MODEL);
  });

  it('19. neither names a retired id', () => {
    for (const retired of ['deepseek-chat', 'deepseek-reasoner', 'deepseek-v4-flash']) {
      expect(DEEPSEEK_DEFAULT_MODEL, retired).not.toBe(retired);
      expect(COLLABBOARD_DEFAULT_MODEL, retired).not.toBe(retired);
    }
  });
});
