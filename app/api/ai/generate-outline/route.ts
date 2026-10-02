import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

import { OUTLINE_SYSTEM_PROMPT, OutlineParseError, parseOutline, withValuesEstimated } from '@/lib/ai/outline';
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

const DETAIL_VALUES = new Set(['auto', 'summary', 'detailed']);
const VISUAL_HINT_MAX = 60;

interface OutlineOptions {
  detail?: 'auto' | 'summary' | 'detailed';
  keepWording?: boolean;
  visualHint?: string;
  estimateValues?: boolean;
}

/**
 * PATCH-237. Parses the optional Customize options. Unknown keys are ignored; a
 * malformed value or an over-long hint is a hard error (the caller returns 400).
 */
function parseOutlineOptions(raw: unknown): OutlineOptions {
  if (raw === undefined) return {};
  if (!isObject(raw)) throw new Error('options must be an object.');

  const options: OutlineOptions = {};

  if (raw.detail !== undefined) {
    if (typeof raw.detail !== 'string' || !DETAIL_VALUES.has(raw.detail)) {
      throw new Error('options.detail must be auto, summary or detailed.');
    }
    options.detail = raw.detail as OutlineOptions['detail'];
  }

  if (raw.keepWording !== undefined) {
    if (typeof raw.keepWording !== 'boolean') throw new Error('options.keepWording must be a boolean.');
    options.keepWording = raw.keepWording;
  }

  if (raw.visualHint !== undefined) {
    if (typeof raw.visualHint !== 'string') throw new Error('options.visualHint must be a string.');
    // Control characters removed; trimmed; capped at 60.
    const cleaned = raw.visualHint.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleaned.length > VISUAL_HINT_MAX) throw new Error(`options.visualHint must be ${VISUAL_HINT_MAX} characters or fewer.`);
    if (cleaned) options.visualHint = cleaned;
  }

  if (raw.estimateValues !== undefined) {
    if (typeof raw.estimateValues !== 'boolean') throw new Error('options.estimateValues must be a boolean.');
    if (raw.estimateValues) options.estimateValues = true;
  }

  return options;
}

/**
 * Builds the "User preferences" block from FIXED sentences only. The hint is the
 * one variable part, and its double quotes are removed before it goes inside the
 * quoted instruction.
 */
function buildPreferenceBlock(options: OutlineOptions): string {
  const lines: string[] = [];
  if (options.detail === 'summary') lines.push('Keep labels to at most 4 words and omit details unless essential.');
  if (options.detail === 'detailed') lines.push('Give every item a detail sentence (up to 140 characters).');
  if (options.keepWording) lines.push("Use the user's own words for labels and details; do not paraphrase.");
  if (options.estimateValues) {
    lines.push(
      'The user asked for a chart. Give EVERY item a "value": your best estimate of its share in percent, based on the text, all values together about 100. This replaces the rule "Never invent a value" for this request.',
    );
  }
  if (options.visualHint) {
    const hint = options.visualHint.replace(/"/g, '');
    lines.push(`The user wants this drawn as: "${hint}". Choose the kind and items that suit it.`);
  }
  return lines.length > 0 ? `User preferences:\n${lines.map((l) => `- ${l}`).join('\n')}` : '';
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

    // PATCH-237. The optional Customize preferences.
    let options: OutlineOptions;
    try {
      options = parseOutlineOptions(rawBody.options);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Invalid options.' },
        { status: 400 },
      );
    }

    trackAIGenerationStarted({ mode: 'diagram', subtype: 'outline' });

    // The preference block is appended only when there are options, so a plain
    // request's system prompt is byte-identical to before.
    const preferenceBlock = buildPreferenceBlock(options);
    const systemPrompt = preferenceBlock ? `${OUTLINE_SYSTEM_PROMPT}\n\n${preferenceBlock}` : OUTLINE_SYSTEM_PROMPT;
    const finalPrompt = buildGenerationPrompt(systemPrompt, prompt);

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
        // PATCH-254. The outline is a short list, not a reasoning puzzle; the
        // managed default's thinking step was measured at 3-6x the wait.
        reasoning: 'off',
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
      let outline = parseOutline(parsed);
      // PATCH-250. Only the server sets valuesEstimated, and only when the
      // caller asked for estimates and the model actually gave at least two
      // values. The model's own flag (if any) was dropped by parseOutline.
      if (
        options.estimateValues &&
        outline.items.filter((item) => typeof item.value === 'number').length >= 2
      ) {
        outline = withValuesEstimated(outline);
      }
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
