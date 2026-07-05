import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { ZodError } from 'zod';

import type {
  AIMode,
  DiagramSubtype,
  StoredAIContent,
} from '@/lib/ai/contracts';
import { resolvePromptConfig } from '@/lib/ai/mode-registry';
import {
  trackAIConversionFailed,
  trackAIConversionStarted,
  trackAIConversionSucceeded,
} from '@/lib/ai/telemetry';
import {
  DIAGRAM_SUBTYPE_SCHEMAS,
  createValidationError,
  safeValidateAIContentWithSubtypeCheck,
} from '@/lib/ai/validators';
import { isConversionAllowed } from '@/lib/ai/conversion-matrix';
import { MODE_REGISTRY } from '@/lib/ai/mode-registry';

// Share the same rate-limit store as generate-component (in-memory per process)
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
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAIMode(value: unknown): value is AIMode {
  return typeof value === 'string'
    && Object.prototype.hasOwnProperty.call(MODE_REGISTRY, value);
}

function isDiagramSubtype(value: unknown): value is DiagramSubtype {
  return typeof value === 'string'
    && Object.prototype.hasOwnProperty.call(DIAGRAM_SUBTYPE_SCHEMAS, value);
}

function isStoredAIContent(value: unknown): value is StoredAIContent {
  if (!isObject(value)) return false;
  return (
    value.version === 1
    && isAIMode(value.mode)
    && isObject(value.data)
  );
}

async function callDeepSeek(prompt: string): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not configured');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    signal: controller.signal,
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: 'Return only valid JSON with no markdown, code fences, or surrounding prose.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 1200,
    }),
  }).finally(() => clearTimeout(timer));

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`DeepSeek error: ${err}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('DeepSeek returned an empty response.');
  }
  return content;
}

function parseModelJson(raw: string): unknown {
  const trimmed = raw.trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error('AI returned invalid JSON.');
  }
}

const MODE_TYPE_FIELD: Record<AIMode, string> = {
  lesson_board: 'lesson_board',
  diagram: 'diagram',
  photo_card: 'photo',
  workshop_board: 'workshop_board',
};

function injectStructuralMetadata(
  parsed: unknown,
  mode: AIMode,
  subtype: DiagramSubtype | undefined,
  renderer: string | undefined,
): unknown {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return parsed;
  }
  const obj = { ...(parsed as Record<string, unknown>) };
  obj.type = MODE_TYPE_FIELD[mode];
  if (mode === 'diagram' && subtype) {
    obj.subtype = subtype;
    if (renderer) obj.renderer = renderer;
  }
  if (!obj.title || typeof obj.title !== 'string' || !obj.title.trim()) {
    const raw = subtype ?? mode;
    obj.title = raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // Normalize alias field names the model may use instead of the required field names
  if (mode === 'lesson_board' && Array.isArray(obj.sections)) {
    obj.sections = (obj.sections as Record<string, unknown>[]).map((s) => {
      if (typeof s !== 'object' || s === null) return s;
      const section = { ...s } as Record<string, unknown>;
      if (!section.title || typeof section.title !== 'string' || !section.title.trim()) {
        const alias = section.heading ?? section.name ?? section.label ?? section.subtitle;
        if (typeof alias === 'string' && alias.trim()) section.title = alias;
      }
      return section;
    });
  }

  if (mode === 'workshop_board' && Array.isArray(obj.blocks)) {
    obj.blocks = (obj.blocks as Record<string, unknown>[]).map((b) => {
      if (typeof b !== 'object' || b === null) return b;
      const block = { ...b } as Record<string, unknown>;
      if (!block.title || typeof block.title !== 'string' || !block.title.trim()) {
        const alias = block.heading ?? block.name ?? block.label;
        if (typeof alias === 'string' && alias.trim()) block.title = alias;
      }
      return block;
    });
  }

  if (mode === 'diagram' && subtype === 'timeline' && Array.isArray(obj.items)) {
    obj.items = (obj.items as Record<string, unknown>[]).map((item) => {
      if (typeof item !== 'object' || item === null) return item;
      const it = { ...item } as Record<string, unknown>;
      if (!it.title || typeof it.title !== 'string' || !it.title.trim()) {
        const alias = it.event ?? it.name ?? it.label ?? it.heading;
        if (typeof alias === 'string' && alias.trim()) it.title = alias;
      }
      if (!it.dateLabel) {
        const dateAlias = it.date ?? it.year;
        if (dateAlias !== undefined) it.dateLabel = String(dateAlias);
      }
      return it;
    });
  }

  return obj;
}

function buildConversionPrompt(
  sourceEnvelope: StoredAIContent,
  targetMode: AIMode,
  targetSubtype: DiagramSubtype | undefined,
  instruction: string,
  targetSystemPrompt: string,
): string {
  const sourceJson = JSON.stringify(sourceEnvelope.data, null, 2);
  const targetDesc = targetSubtype
    ? `${targetMode} (subtype: ${targetSubtype})`
    : targetMode;

  return `
${targetSystemPrompt}

Convert the following existing content to the ${targetDesc} format.
Preserve the semantic meaning and data from the source as closely as possible.
${instruction ? `Additional instruction: ${instruction}` : ''}

Source content (JSON):
${sourceJson}

Return a single JSON object matching the ${targetDesc} schema exactly.
Do not include the source content or any explanation outside the JSON.
  `.trim();
}

export async function POST(req: NextRequest) {
  let capturedSourceMode: AIMode | undefined;
  let capturedTargetMode: AIMode | undefined;

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
        { error: 'Rate limit exceeded. Please wait a moment before converting again.' },
        { status: 429 },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    if (!isObject(body)) {
      return NextResponse.json({ error: 'Request body must be a JSON object.' }, { status: 400 });
    }

    const { sourceEnvelope, targetMode, targetSubtype, instruction } = body;

    if (!isStoredAIContent(sourceEnvelope)) {
      return NextResponse.json({ error: 'sourceEnvelope must be a valid AI content envelope.' }, { status: 400 });
    }

    if (!isAIMode(targetMode)) {
      return NextResponse.json({ error: 'targetMode is required and must be a valid mode.' }, { status: 400 });
    }

    if (targetMode === 'diagram' && !isDiagramSubtype(targetSubtype)) {
      return NextResponse.json({ error: 'targetSubtype is required when targetMode is diagram.' }, { status: 400 });
    }

    const resolvedTargetSubtype = targetMode === 'diagram' && isDiagramSubtype(targetSubtype)
      ? targetSubtype
      : undefined;

    // Determine source subtype
    const sourceSubtype: DiagramSubtype | undefined =
      sourceEnvelope.mode === 'diagram' && isObject(sourceEnvelope.data)
        && isDiagramSubtype((sourceEnvelope.data as Record<string, unknown>).subtype)
        ? (sourceEnvelope.data as Record<string, unknown>).subtype as DiagramSubtype
        : undefined;

    capturedSourceMode = sourceEnvelope.mode;
    capturedTargetMode = targetMode;

    if (!isConversionAllowed(sourceEnvelope.mode, sourceSubtype, targetMode, resolvedTargetSubtype)) {
      return NextResponse.json(
        { error: `Conversion from ${sourceEnvelope.mode}${sourceSubtype ? ':' + sourceSubtype : ''} to ${targetMode}${resolvedTargetSubtype ? ':' + resolvedTargetSubtype : ''} is not supported.` },
        { status: 400 },
      );
    }

    trackAIConversionStarted({
      sourceMode: sourceEnvelope.mode,
      sourceSubtype,
      targetMode,
      targetSubtype: resolvedTargetSubtype,
    });

    const promptConfig = resolvePromptConfig(targetMode, resolvedTargetSubtype);
    const extraInstruction = typeof instruction === 'string' ? instruction.trim() : '';
    const finalPrompt = buildConversionPrompt(
      sourceEnvelope,
      targetMode,
      resolvedTargetSubtype,
      extraInstruction,
      promptConfig.systemPrompt,
    );

    let raw: string;
    try {
      raw = await callDeepSeek(finalPrompt);
    } catch (error) {
      trackAIConversionFailed({
        sourceMode: sourceEnvelope.mode,
        sourceSubtype,
        targetMode,
        targetSubtype: resolvedTargetSubtype,
        reason: error instanceof Error ? error.message : 'DeepSeek call failed.',
      });
      return NextResponse.json(
        { error: 'AI provider failed to return usable output.' },
        { status: 502 },
      );
    }

    let parsed: unknown;
    try {
      parsed = parseModelJson(raw);
    } catch (error) {
      trackAIConversionFailed({
        sourceMode: sourceEnvelope.mode,
        sourceSubtype,
        targetMode,
        targetSubtype: resolvedTargetSubtype,
        reason: error instanceof Error ? error.message : 'AI returned invalid JSON.',
      });
      return NextResponse.json(
        { error: 'AI provider returned unusable output.' },
        { status: 502 },
      );
    }

    const normalized = injectStructuralMetadata(
      parsed,
      targetMode,
      resolvedTargetSubtype,
      promptConfig.renderer,
    );

    const validation = safeValidateAIContentWithSubtypeCheck({
      mode: targetMode,
      subtype: resolvedTargetSubtype,
      data: normalized,
    });

    if (!validation.success) {
      const validationErrorBody = validation.error instanceof ZodError
        ? createValidationError(validation.error)
        : validation.error.message;

      trackAIConversionFailed({
        sourceMode: sourceEnvelope.mode,
        sourceSubtype,
        targetMode,
        targetSubtype: resolvedTargetSubtype,
        reason: validation.error instanceof ZodError
          ? validation.error.message
          : validation.error.message,
      });

      if (validation.error instanceof ZodError) {
        return NextResponse.json({ error: validationErrorBody }, { status: 422 });
      }
      return NextResponse.json({ error: validationErrorBody }, { status: 400 });
    }

    const envelope: StoredAIContent = {
      mode: targetMode,
      version: 1,
      data: validation.data,
      meta: {
        renderer: promptConfig.renderer,
        subtype: resolvedTargetSubtype,
        prompt: sourceEnvelope.meta?.prompt,
        createdAt: new Date().toISOString(),
      },
    };

    trackAIConversionSucceeded({
      sourceMode: sourceEnvelope.mode,
      sourceSubtype,
      targetMode,
      targetSubtype: resolvedTargetSubtype,
    });

    return NextResponse.json(envelope);

  } catch (error) {
    trackAIConversionFailed({
      sourceMode: capturedSourceMode ?? 'unknown',
      targetMode: capturedTargetMode ?? 'unknown',
      reason: error instanceof Error ? error.message : 'Unexpected error.',
    });
    console.error('AI Conversion Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error.' },
      { status: 500 },
    );
  }
}
