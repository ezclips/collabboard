import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

import { OutlineParseError, parseOutline } from '@/lib/ai/outline';
import { withoutElementOverrides } from '@/lib/ai/antv/templateOverrides';
import { trackAIGenerationFailed, trackAIGenerationStarted } from '@/lib/ai/telemetry';
import type { AIGenerationAttribution } from '@/lib/ai/contracts';
import { ComponentCreditRefusal, generateComponentText } from '@/lib/server/ai/componentGeneration';
import { AIProviderError } from '@/lib/server/ai/providers/errors';
import { aiProviderErrorStatus } from '@/lib/server/settings/aiProviderErrorStatus';
import { canReadBoardKnowledge } from '@/lib/server/knowledge/knowledgeBoardReadAuthorization';
import type { KnowledgeBoardReadAuthorizationClient } from '@/lib/server/knowledge/knowledgeBoardReadAuthorization';
import type { UserId } from '@/lib/domain/core/ids';

import { DrawnParseError, parseDrawnPicture, type DrawnParseResult } from '@/lib/ai/drawn/format';
import { preferredAttempt } from '@/lib/ai/drawn/attemptRanking';
import { repairPicture, type DrawnIssue, type RepairResult } from '@/lib/ai/drawn/repair';
import { DRAW_SYSTEM_PROMPT, DRAWN_KINDS, buildDrawPrompt, kindForOutline, type DrawnKind } from '@/lib/ai/drawn/prompt';

/**
 * PATCH-283 H. The AI post's drawing spike: the model writes a DrawnPicture, our
 * code repairs it (data proportions, text fit, canvas), and one optional auditor
 * round fixes layout problems. NOTHING is stored, and no product UI calls this.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEED_MAX = 9999;
const DRAWN_MAX_TOKENS = 8000;
const DRAWN_TIMEOUT_MS = 60_000;
const DRAWN_TEMPERATURE = 0.8;
const REPAIRABLE_ISSUES: readonly DrawnIssue['type'][] = ['overlap', 'text-overlap', 'text-crosses-shape', 'missing-label'];

const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_MAX = 12;
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stripFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '');
}

function parseModelJson(raw: string): unknown {
  try {
    return JSON.parse(stripFences(raw));
  } catch {
    throw new Error('AI returned invalid JSON.');
  }
}

function buildAuditUser(result: RepairResult, outline: unknown): string {
  const issues = result.issues.map((issue) => `- ${issue.type}: ${issue.message}`).join('\n');
  return (
    'Fix exactly these problems, return the whole picture as DrawnPicture JSON, changing nothing else:\n' +
    `${issues}\n\nOutline:\n${JSON.stringify(outline)}\n\nPicture:\n${JSON.stringify(result.picture)}`
  );
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

    const rawKind = rawBody.kind;
    if (rawKind !== 'auto' && !DRAWN_KINDS.includes(rawKind as DrawnKind)) {
      return NextResponse.json({ error: 'kind must be a drawn kind or "auto".' }, { status: 400 });
    }

    const seed = rawBody.seed;
    if (typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0 || seed > SEED_MAX) {
      return NextResponse.json({ error: `seed must be an integer between 0 and ${SEED_MAX}.` }, { status: 400 });
    }

    if (rawBody.examples !== undefined && typeof rawBody.examples !== 'boolean') {
      return NextResponse.json({ error: 'examples must be a boolean.' }, { status: 400 });
    }
    const examples = rawBody.examples !== false;

    if (rawBody.reasoning !== undefined && rawBody.reasoning !== 'off' && rawBody.reasoning !== 'auto') {
      return NextResponse.json({ error: 'reasoning must be "off" or "auto".' }, { status: 400 });
    }

    const rawBoardId = rawBody.boardId;
    if (rawBoardId !== undefined && (typeof rawBoardId !== 'string' || !UUID_PATTERN.test(rawBoardId))) {
      return NextResponse.json({ error: 'boardId must be a UUID.' }, { status: 400 });
    }
    const boardId = typeof rawBoardId === 'string' ? rawBoardId : null;

    let outline;
    try {
      outline = withoutElementOverrides(parseOutline(rawBody.outline, { source: 'stored' }));
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof OutlineParseError ? error.message : 'outline is required.' },
        { status: 400 },
      );
    }

    const kind: DrawnKind = rawKind === 'auto' ? kindForOutline(outline) : (rawKind as DrawnKind);
    const reasoningMode = process.env.NODE_ENV === 'production' ? 'off' : rawBody.reasoning === 'auto' ? 'auto' : 'off';
    const reasoningInput: { reasoning?: 'off' } = reasoningMode === 'off' ? { reasoning: 'off' } : {};

    trackAIGenerationStarted({ mode: 'diagram', subtype: 'drawn' });

    const canReadBoard = (id: string) =>
      canReadBoardKnowledge(supabase as unknown as KnowledgeBoardReadAuthorizationClient, id, user.id);

    const drawPrompt = buildDrawPrompt({ outline, kind, seed, examples });

    const started = Date.now();
    let attempts = 0;
    let raw: string;
    let generatedBy: AIGenerationAttribution;
    let first: RepairResult;
    try {
      const generation = await generateComponentText({
        userId: user.id as UserId,
        system: drawPrompt.system,
        user: drawPrompt.user,
        maxTokens: DRAWN_MAX_TOKENS,
        temperature: DRAWN_TEMPERATURE,
        timeoutMs: DRAWN_TIMEOUT_MS,
        ...reasoningInput,
        boardId,
        canReadBoard,
        creditFeature: 'component',
        creditCost: 1,
      });
      raw = generation.text;
      generatedBy = generation.generatedBy;
      attempts = 1;
    } catch (error) {
      if (error instanceof ComponentCreditRefusal) {
        return NextResponse.json(
          error.code === 'forbidden' ? { error: error.message } : { error: error.message, code: error.code },
          { status: error.status },
        );
      }
      trackAIGenerationFailed({
        mode: 'diagram',
        subtype: 'drawn',
        stage: 'provider',
        reason: error instanceof Error ? error.message : 'AI provider call failed.',
      });
      if (error instanceof AIProviderError) {
        return NextResponse.json(
          { error: error.message, category: error.category },
          { status: aiProviderErrorStatus(error.category) },
        );
      }
      return NextResponse.json({ error: 'AI provider failed to return usable output.' }, { status: 502 });
    }

    let parsed: DrawnParseResult;
    try {
      parsed = parseDrawnPicture(parseModelJson(raw));
      first = repairPicture(parsed.picture, outline, kind);
    } catch (error) {
      trackAIGenerationFailed({
        mode: 'diagram',
        subtype: 'drawn',
        stage: 'parse',
        reason: error instanceof Error ? error.message : 'AI returned an unusable picture.',
      });
      return NextResponse.json(
        { error: 'AI provider returned unusable output.', details: error instanceof Error ? error.message : undefined },
        { status: error instanceof DrawnParseError ? 422 : 502 },
      );
    }

    let result = first;
    const dropped = parsed.dropped;
    if (first.issues.some((issue) => REPAIRABLE_ISSUES.includes(issue.type))) {
      try {
        attempts += 1;
        const audit = await generateComponentText({
          userId: user.id as UserId,
          system: DRAW_SYSTEM_PROMPT,
          user: buildAuditUser(first, outline),
          maxTokens: DRAWN_MAX_TOKENS,
          temperature: DRAWN_TEMPERATURE,
          timeoutMs: DRAWN_TIMEOUT_MS,
          ...reasoningInput,
          boardId,
          canReadBoard,
          creditFeature: 'component',
          creditCost: 0,
        });
        const second = repairPicture(parseDrawnPicture(parseModelJson(audit.text)).picture, outline, kind);
        if (preferredAttempt(first, second) === second) {
          result = second;
          generatedBy = audit.generatedBy;
        }
      } catch {
        // The auditor is best-effort: keep the first repaired picture.
      }
    }

    return NextResponse.json({
      picture: result.picture,
      kind,
      variant: seed % 3,
      seed,
      issues: result.issues,
      fixes: result.fixes,
      dropped,
      attempts,
      ms: Date.now() - started,
      generatedBy,
    });
  } catch (error) {
    trackAIGenerationFailed({
      mode: 'diagram',
      subtype: 'drawn',
      stage: 'request',
      reason: error instanceof Error ? error.message : 'Unexpected error.',
    });
    console.error('AI Draw Picture Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error.' },
      { status: 500 },
    );
  }
}
