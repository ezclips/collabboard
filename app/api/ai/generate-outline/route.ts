import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

import { OUTLINE_SYSTEM_PROMPT, OutlineParseError, parseOutline } from '@/lib/ai/outline';
import {
  trackAIGenerationFailed,
  trackAIGenerationStarted,
} from '@/lib/ai/telemetry';
import type { AIGenerationAttribution } from '@/lib/ai/contracts';
import { COMPONENT_MAX_TOKENS, ComponentCreditRefusal, generateComponentText } from '@/lib/server/ai/componentGeneration';
import { AIProviderError } from '@/lib/server/ai/providers/errors';
import { aiProviderErrorStatus } from '@/lib/server/settings/aiProviderErrorStatus';
import { canReadBoardKnowledge } from '@/lib/server/knowledge/knowledgeBoardReadAuthorization';
import type { KnowledgeBoardReadAuthorizationClient } from '@/lib/server/knowledge/knowledgeBoardReadAuthorization';
import type { UserId } from '@/lib/domain/core/ids';

/**
 * PATCH-233. "Show options": one AI call extracts the STRUCTURE of the prompt
 * (an outline); the client draws that outline several ways locally. This route
 * returns the outline and attribution only -- nothing is stored.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROMPT_MAX = 4000;

// In-memory rate limiter: max 5 requests per IP per minute (same pattern as the component route).
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count += 1;
  return true;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function buildGenerationPrompt(systemPrompt: string, userPrompt: string): string {
  return `
${systemPrompt}

User request:
${userPrompt}

Return valid JSON only.
  `.trim();
}

function parseModelJson(raw: string): unknown {
  const trimmed = raw.trim();
  const withoutFences = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '');

  try {
    return JSON.parse(withoutFences);
  } catch {
    throw new Error('AI returned invalid JSON.');
  }
}

const JSON_ONLY_SYSTEM = 'Return only valid JSON with no markdown, code fences, or surrounding prose.';

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
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait a moment before generating again.' },
        { status: 429 },
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    if (!isObject(rawBody)) {
      return NextResponse.json({ error: 'Request body must be a JSON object.' }, { status: 400 });
    }

    const rawPrompt = rawBody.prompt;
    if (typeof rawPrompt !== 'string' || !rawPrompt.trim()) {
      return NextResponse.json({ error: 'Prompt is required.' }, { status: 400 });
    }
    const prompt = rawPrompt.trim();
    if (prompt.length > PROMPT_MAX) {
      return NextResponse.json({ error: `Prompt must be ${PROMPT_MAX} characters or fewer.` }, { status: 400 });
    }

    const rawBoardId = rawBody.boardId;
    if (rawBoardId !== undefined && (typeof rawBoardId !== 'string' || !UUID_PATTERN.test(rawBoardId))) {
      return NextResponse.json({ error: 'boardId must be a UUID.' }, { status: 400 });
    }
    const boardId = typeof rawBoardId === 'string' ? rawBoardId : null;

    trackAIGenerationStarted({ mode: 'diagram', subtype: 'outline' });

    const finalPrompt = buildGenerationPrompt(OUTLINE_SYSTEM_PROMPT, prompt);

    let raw: string;
    let generatedBy: AIGenerationAttribution;
    try {
      const generation = await generateComponentText({
        userId: user.id as UserId,
        system: JSON_ONLY_SYSTEM,
        user: finalPrompt,
        maxTokens: COMPONENT_MAX_TOKENS,
        temperature: 0.4,
        timeoutMs: 25_000,
        boardId,
        canReadBoard: (id) => canReadBoardKnowledge(
          supabase as unknown as KnowledgeBoardReadAuthorizationClient,
          id,
          user.id,
        ),
        creditFeature: 'component',
        creditCost: 1,
      });
      raw = generation.text;
      generatedBy = generation.generatedBy;
    } catch (error) {
      if (error instanceof ComponentCreditRefusal) {
        return NextResponse.json(
          error.code === 'forbidden' ? { error: error.message } : { error: error.message, code: error.code },
          { status: error.status },
        );
      }
      trackAIGenerationFailed({
        mode: 'diagram',
        subtype: 'outline',
        stage: 'provider',
        reason: error instanceof Error ? error.message : 'AI provider call failed.',
      });
      if (error instanceof AIProviderError) {
        return NextResponse.json(
          { error: error.message, category: error.category },
          { status: aiProviderErrorStatus(error.category) },
        );
      }
      return NextResponse.json(
        { error: 'AI provider failed to return usable output.' },
        { status: 502 },
      );
    }

    let parsed: unknown;
    try {
      parsed = parseModelJson(raw);
    } catch (error) {
      trackAIGenerationFailed({
        mode: 'diagram',
        subtype: 'outline',
        stage: 'parse',
        reason: error instanceof Error ? error.message : 'AI returned invalid JSON.',
      });
      return NextResponse.json(
        {
          error: 'AI provider returned unusable output.',
          details: error instanceof Error ? error.message : 'AI returned invalid JSON.',
        },
        { status: 502 },
      );
    }

    try {
      const outline = parseOutline(parsed);
      return NextResponse.json({ outline, generatedBy });
    } catch (error) {
      const message = error instanceof OutlineParseError
        ? error.message
        : 'AI provider returned unusable output.';
      trackAIGenerationFailed({ mode: 'diagram', subtype: 'outline', stage: 'parse', reason: message });
      return NextResponse.json({ error: message }, { status: 422 });
    }
  } catch (error) {
    trackAIGenerationFailed({
      mode: 'diagram',
      subtype: 'outline',
      stage: 'request',
      reason: error instanceof Error ? error.message : 'Unexpected error.',
    });
    console.error('AI Generate Outline Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error.' },
      { status: 500 },
    );
  }
}
