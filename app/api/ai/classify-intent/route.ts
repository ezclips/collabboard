import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

import type { AIMode, DiagramSubtype } from '@/lib/ai/contracts';
import { MODE_REGISTRY } from '@/lib/ai/mode-registry';
import { DIAGRAM_SUBTYPE_SCHEMAS } from '@/lib/ai/validators';
import { trackAIAutoModeSelected, trackAIClassifyFailed } from '@/lib/ai/telemetry';
import { generateComponentText, ComponentCreditRefusal } from '@/lib/server/ai/componentGeneration';
import { canReadBoardKnowledge } from '@/lib/server/knowledge/knowledgeBoardReadAuthorization';
import type { KnowledgeBoardReadAuthorizationClient } from '@/lib/server/knowledge/knowledgeBoardReadAuthorization';
import type { UserId } from '@/lib/domain/core/ids';

/** PATCH-188. The optional board id, validated the same way a zod uuid is. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ClassifyIntentResult {
  mode: AIMode;
  subtype?: DiagramSubtype;
  confidence: 'high' | 'low';
}

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

function isAIMode(value: unknown): value is AIMode {
  return typeof value === 'string'
    && Object.prototype.hasOwnProperty.call(MODE_REGISTRY, value);
}

function isDiagramSubtype(value: unknown): value is DiagramSubtype {
  return typeof value === 'string'
    && Object.prototype.hasOwnProperty.call(DIAGRAM_SUBTYPE_SCHEMAS, value);
}

const CLASSIFY_SYSTEM_PROMPT = `
You are a content type classifier.
Given a user prompt, identify the best content type to generate.

Available modes:
- lesson_board: structured teaching content with sections, objectives, and timing
- diagram: visual content (flowchart, mindmap, pie_chart, bar_chart, timeline, comparison)
- photo_card: image-focused card with a short caption and photo
- workshop_board: facilitated workshop or meeting structure with blocks and flow

If mode is "diagram", also provide the best subtype:
- flowchart: step-by-step process or decision tree
- mindmap: branching concept map
- pie_chart: proportional data (parts of a whole)
- bar_chart: category comparisons
- timeline: chronological events
- comparison: side-by-side options

Return JSON only. No markdown, no prose.
Format:
{ "mode": "...", "subtype": "...", "confidence": "high" | "low" }
Only include "subtype" when mode is "diagram".
Use "low" confidence when the prompt is ambiguous or could match multiple types equally.
`.trim();

/** Unchanged from when this route spoke to DeepSeek directly. */
const JSON_ONLY_SYSTEM = 'Return only valid JSON with no markdown, code fences, or surrounding prose.';

/**
 * WAS 80, AND 80 IS BROKEN ON A REASONING MODEL.
 *
 * The answer is about 25 tokens -- `{"mode":"diagram","subtype":"flowchart",
 * "confidence":"high"}` -- so 80 was generous for `deepseek-chat`, which
 * emitted it and stopped. The managed default is now `deepseek-flash`, which
 * REASONS FIRST: it spends completion tokens on `reasoning_content` before any
 * `content`, and `max_tokens` caps the two together. At 80 the reasoning eats
 * the whole budget, the response comes back `finish_reason: "length"` with
 * `content: ""`, and the adapter correctly rejects an empty completion.
 *
 * MEASURED, not guessed. Across 20 calls with this exact prompt the reasoning
 * alone ran 29-153 tokens, and the real route failed 2 of 5 realistic prompts
 * at 80 -- INTERMITTENTLY, which is the worst shape: the client treats a failed
 * classify as "keep the current mode", so Auto silently picked the wrong format
 * rather than showing an error.
 *
 * 400 is ~2.5x the worst reasoning burst observed plus the answer. A call that
 * finishes early is billed for what it generated, so the higher cap costs
 * nothing on those -- and the calls it rescues were previously billed for 80
 * tokens of nothing at all.
 */
const CLASSIFY_MAX_TOKENS = 400;

/**
 * Classifier failures since this instance started.
 *
 * A COUNT, not just a line, because the defect this exists to expose was
 * INTERMITTENT: individual failures look like bad luck, and a rate does not.
 * Per-process like the rate limiter above, and reset by a deploy -- enough to
 * make a recurrence visible, not an accounting record.
 */
let classifyFailures = 0;

/**
 * Both ways the classifier can fail, recorded in one place.
 *
 * WHY THIS IS HERE AT ALL: a failed classify is answered by keeping whatever
 * mode is already selected, which is reasonable behaviour and totally silent.
 * That silence is how an undersized token budget hid -- Auto picked the wrong
 * format intermittently and nothing said so.
 *
 * It logs directly as well as through telemetry on purpose: `emit` is a no-op
 * in production until it is wired to an endpoint, so the telemetry event alone
 * would be invisible exactly where a recurrence matters most. The direct line
 * matches the console.error this route already uses for its outer catch.
 */
function recordClassifyFailure(stage: 'provider' | 'parse', reason: string): void {
  classifyFailures += 1;
  trackAIClassifyFailed({ stage, reason, failureCount: classifyFailures });
  console.warn(
    `[ai] classify-intent failed (${stage}); Auto keeps the current mode. `
    + `failures_since_start=${classifyFailures} reason=${reason}`,
  );
}

function parseClassifyResponse(raw: string): ClassifyIntentResult {
  const trimmed = raw.trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '');

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('Classifier returned invalid JSON.');
  }

  if (
    typeof parsed !== 'object'
    || parsed === null
    || !isAIMode((parsed as Record<string, unknown>).mode)
  ) {
    throw new Error('Classifier returned an invalid mode.');
  }

  const obj = parsed as Record<string, unknown>;
  const mode = obj.mode as AIMode;
  const subtype = mode === 'diagram' && isDiagramSubtype(obj.subtype) ? obj.subtype : undefined;
  const confidence: 'high' | 'low' = obj.confidence === 'low' ? 'low' : 'high';

  if (mode === 'diagram' && !subtype) {
    // Fallback to flowchart if diagram was selected but subtype is missing/invalid
    return { mode, subtype: 'flowchart', confidence: 'low' };
  }

  return { mode, subtype, confidence };
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
        { error: 'Rate limit exceeded.' },
        { status: 429 },
      );
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

    const { prompt } = body as Record<string, unknown>;
    if (typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ error: 'prompt is required.' }, { status: 400 });
    }

    // PATCH-188. The OPTIONAL board this classification runs on. Cost 0 and
    // never recorded, but checked: an exhausted Free workspace pauses here too.
    const rawBoardId = (body as Record<string, unknown>).boardId;
    if (rawBoardId !== undefined && (typeof rawBoardId !== 'string' || !UUID_PATTERN.test(rawBoardId))) {
      return NextResponse.json({ error: 'boardId must be a UUID.' }, { status: 400 });
    }
    const boardId = typeof rawBoardId === 'string' ? rawBoardId : null;

    // The classifier runs on EVERY Auto generation, so it is the
    // highest-frequency AI call in the product. It resolves the same component
    // role the generation itself will: a user who has chosen a provider for
    // their cards has chosen it for the step that decides which card to build,
    // and no invisible second provider keeps running beside it.
    //
    // The classifier's own answer is never attributed in the response -- it
    // picks a mode, it does not produce content anyone is shown.
    let raw: string;
    try {
      const generation = await generateComponentText({
        userId: user.id as UserId,
        system: JSON_ONLY_SYSTEM,
        user: `${CLASSIFY_SYSTEM_PROMPT}\n\nUser prompt:\n${prompt.trim()}`,
        maxTokens: CLASSIFY_MAX_TOKENS,
        temperature: 0.1,
        timeoutMs: 10_000,
        boardId,
        canReadBoard: (id) => canReadBoardKnowledge(
          supabase as unknown as KnowledgeBoardReadAuthorizationClient,
          id,
          user.id,
        ),
        // No creditFeature: the classifier records nothing.
        creditCost: 0,
      });
      raw = generation.text;
    } catch (error) {
      // PATCH-188. A credit refusal is not a classifier failure; it maps to its
      // own status and code so the client can show the plan message.
      if (error instanceof ComponentCreditRefusal) {
        return NextResponse.json(
          error.code === 'forbidden' ? { error: error.message } : { error: error.message, code: error.code },
          { status: error.status },
        );
      }
      // The reason is ours, never the provider's response body -- AIProviderError
      // carries a fixed message by construction. `details` is gone for the same
      // reason: it used to echo that body straight back to the browser.
      recordClassifyFailure('provider', error instanceof Error ? error.message : 'unknown');
      // The client already treats any non-OK classify as "stay on the current
      // mode", so the fixed message costs it nothing.
      return NextResponse.json({ error: 'Classifier failed.' }, { status: 502 });
    }

    let result: ClassifyIntentResult;
    try {
      result = parseClassifyResponse(raw);
    } catch (error) {
      // Safe fallback: return lesson_board low confidence rather than crashing.
      // Recorded, because this branch silently decides the user's format --
      // every prompt that lands here becomes a lesson board no matter what it
      // asked for, and nothing else in the product would ever say so.
      recordClassifyFailure('parse', error instanceof Error ? error.message : 'unknown');
      result = { mode: 'lesson_board', confidence: 'low' };
    }

    trackAIAutoModeSelected({
      mode: result.mode,
      subtype: result.subtype,
      confidence: result.confidence,
    });

    return NextResponse.json(result);

  } catch (error) {
    console.error('AI Classify Intent Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error.' },
      { status: 500 },
    );
  }
}
