import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

import {
  isTextAction,
  TEXT_ACTION_INSTRUCTION_MAX,
  TEXT_ACTION_SELECTED_TEXT_MAX,
  type TextAction,
} from '@/lib/ai/textActions';
import { AI_ROLE_EDIT, isAIRole, type AIRole } from '@/lib/ai/aiRoles';
import { resolveAIModelForRole } from '@/lib/server/ai/resolveAIModelForRole';
import { getAIProviderAdapter } from '@/lib/server/ai/providers/registry';
import { AIProviderError } from '@/lib/server/ai/providers/errors';
import { aiProviderErrorStatus } from '@/lib/server/settings/aiProviderErrorStatus';
import { createAIRolePreferenceRepository } from '@/lib/infra/settings/aiRolePreferenceRepository';
import { createAIProviderCredentialRepository } from '@/lib/infra/settings/aiProviderCredentialRepository';
import type { UserId } from '@/lib/domain/core/ids';

// In-memory, per-instance rate limiter -- same fixed-window shape as the
// existing AI routes (classify-intent, generate-component, convert-component).
// Their per-instance limitation is pre-existing debt, not addressed here.
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

const ACTION_TASKS: Record<Exclude<TextAction, 'custom'>, string> = {
  improve: 'Improve clarity, grammar, and natural wording while preserving meaning.',
  shorten: 'Make the text more concise while preserving essential meaning.',
  'fix-grammar': 'Correct grammar, spelling, and punctuation while preserving wording and meaning where possible.',
};

function buildSystemPrompt(action: TextAction, instruction: string | undefined): string {
  const task = action === 'custom' ? (instruction as string) : ACTION_TASKS[action];
  return [
    'You transform a short piece of user-selected text for a text editor.',
    `Task: ${task}`,
    'Return ONLY the transformed text.',
    'No quotation marks around it. No commentary. No markdown. No JSON. No HTML.',
  ].join('\n');
}

/**
 * The provider-execution seam, and the ONLY thing BYOK changed about this
 * route. Auth, validation, the system prompt, the generation parameters and
 * the response shape above are all exactly as they were; what moved is WHICH
 * provider runs the request -- resolved per user and per role rather than
 * hard-wired to DeepSeek.
 *
 * A user who has configured nothing still resolves to CollabBoard Default --
 * the managed provider, its model and the server's own key -- with no
 * credential-table read at all. This route deliberately names no provider,
 * model or endpoint of its own; every one of those is the resolver's answer.
 *
 * The 20s timeout stays owned HERE, exactly as it was when this function spoke
 * to DeepSeek directly. Adapters forward the signal and never start a timer of
 * their own, so there is still exactly one clock on this path.
 */
async function generateResolvedText(
  userId: UserId,
  role: AIRole,
  systemPrompt: string,
  selectedText: string,
): Promise<string> {
  const resolved = await resolveAIModelForRole(userId, role, {
    preferences: createAIRolePreferenceRepository(),
    credentials: createAIProviderCredentialRepository(),
  });
  const adapter = getAIProviderAdapter(resolved.provider);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    return await adapter.generateText({
      model: resolved.model,
      apiKey: resolved.apiKey,
      system: systemPrompt,
      user: selectedText,
      maxTokens: 1500,
      temperature: 0.3,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ error: 'Request body must be a JSON object.' }, { status: 400 });
    }

    const { action, selectedText, instruction, purpose } = body as Record<string, unknown>;

    if (!isTextAction(action)) {
      return NextResponse.json({ error: 'action is invalid.' }, { status: 400 });
    }
    if (typeof selectedText !== 'string' || !selectedText.trim()) {
      return NextResponse.json({ error: 'selectedText is required.' }, { status: 400 });
    }
    if (selectedText.length > TEXT_ACTION_SELECTED_TEXT_MAX) {
      return NextResponse.json({ error: 'selectedText is too long.' }, { status: 400 });
    }

    if (action === 'custom') {
      if (typeof instruction !== 'string' || !instruction.trim()) {
        return NextResponse.json({ error: 'instruction is required for custom.' }, { status: 400 });
      }
      if (instruction.length > TEXT_ACTION_INSTRUCTION_MAX) {
        return NextResponse.json({ error: 'instruction is too long.' }, { status: 400 });
      }
    } else if (instruction !== undefined) {
      return NextResponse.json({ error: 'instruction is only allowed for custom.' }, { status: 400 });
    }

    // `purpose` names which STORED role preference selects the provider -- it
    // is the only new execution-selection input, and it can never name a
    // provider, model, key or endpoint itself. Omitted means 'edit', so every
    // caller written before BYOK keeps its exact previous behaviour.
    if (purpose !== undefined && !isAIRole(purpose)) {
      return NextResponse.json({ error: 'purpose is invalid.' }, { status: 400 });
    }
    const role: AIRole = purpose === undefined ? AI_ROLE_EDIT : purpose;

    const trimmedInstruction = action === 'custom' ? (instruction as string).trim() : undefined;
    const systemPrompt = buildSystemPrompt(action, trimmedInstruction);

    let raw: string;
    try {
      raw = await generateResolvedText(user.id as UserId, role, systemPrompt, selectedText.trim());
    } catch (error) {
      // A normalized failure carries a category, a provider and a status --
      // never a provider response body, a key, a ciphertext or a wrapped cause
      // -- so its fixed message is safe to return verbatim. An external
      // provider rejecting a stored credential maps to 400, deliberately NOT
      // 401: the CollabBoard session is valid, the user's provider key is not,
      // and a 401 here would read to a browser client as "sign in again".
      if (error instanceof AIProviderError) {
        return NextResponse.json(
          { error: error.message, category: error.category },
          { status: aiProviderErrorStatus(error.category) },
        );
      }
      return NextResponse.json({ error: 'AI request failed.' }, { status: 502 });
    }

    const text = raw.trim();
    if (!text) {
      return NextResponse.json({ error: 'AI returned an empty result.' }, { status: 502 });
    }

    return NextResponse.json({ text });
  } catch (error) {
    console.error('AI Text Action Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error.' },
      { status: 500 },
    );
  }
}
