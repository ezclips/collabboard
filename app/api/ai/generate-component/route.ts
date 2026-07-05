import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { ZodError } from 'zod';

import type {
  AIMode,
  DiagramSubtype,
  GenerateAIContentRequest,
  StoredAIContent,
} from '@/lib/ai/contracts';
import { MODE_REGISTRY, resolvePromptConfig } from '@/lib/ai/mode-registry';
import { enrichAIContentImages } from '@/lib/ai/enrichers/resolve-images';
import {
  trackAIEnrichmentFailed,
  trackAIGenerationFailed,
  trackAIGenerationStarted,
  trackAIGenerationSucceeded,
  trackAIValidationFailed,
} from '@/lib/ai/telemetry';
import {
  DIAGRAM_SUBTYPE_SCHEMAS,
  createValidationError,
  safeValidateAIContentWithSubtypeCheck,
} from '@/lib/ai/validators';

// In-memory rate limiter: max 5 requests per IP per minute
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

function isAIMode(value: unknown): value is AIMode {
  return typeof value === 'string'
    && Object.prototype.hasOwnProperty.call(MODE_REGISTRY, value);
}

function isDiagramSubtype(value: unknown): value is DiagramSubtype {
  return typeof value === 'string'
    && Object.prototype.hasOwnProperty.call(DIAGRAM_SUBTYPE_SCHEMAS, value);
}

function parseGenerateRequest(body: unknown): GenerateAIContentRequest {
  if (!isObject(body)) {
    throw new Error('Request body must be a JSON object.');
  }

  const { prompt, mode, subtype } = body;

  if (typeof prompt !== 'string' || !prompt.trim()) {
    throw new Error('Prompt is required.');
  }

  if (!isAIMode(mode)) {
    throw new Error('Mode is required.');
  }

  if (mode === 'diagram') {
    if (!isDiagramSubtype(subtype)) {
      throw new Error('Diagram subtype is required.');
    }

    return {
      prompt: prompt.trim(),
      mode,
      subtype,
    };
  }

  if (subtype !== undefined) {
    throw new Error('Subtype is only allowed for diagram mode.');
  }

  return {
    prompt: prompt.trim(),
    mode,
    subtype,
  };
}

// Map each AIMode to the `type` literal the Zod schema expects
const MODE_TYPE_FIELD: Record<AIMode, string> = {
  lesson_board: 'lesson_board',
  diagram: 'diagram',
  photo_card: 'photo',
  workshop_board: 'workshop_board',
};

/**
 * The route already knows type/subtype/renderer from the request and registry.
 * Inject them so the model only needs to return content fields.
 * Also supplies fallbacks for fields the model commonly skips:
 *   - title: derived from the subtype/mode name
 *   - code: uses the original user prompt when it looks like Mermaid and the model didn't echo it back
 */
function injectStructuralMetadata(
  parsed: unknown,
  mode: AIMode,
  subtype: DiagramSubtype | undefined,
  renderer: string | undefined,
  userPrompt: string,
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
  // When the user supplies raw Mermaid code and the model doesn't echo it back
  if (renderer === 'diagram_code' && (!obj.code || typeof obj.code !== 'string' || !obj.code.trim())) {
    obj.code = userPrompt;
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

async function callDeepSeek(prompt: string): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();

  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY not configured');
  }

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
      temperature: 0.5,
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

export async function POST(req: NextRequest) {
  let capturedMode: AIMode | undefined;
  let capturedSubtype: DiagramSubtype | undefined;

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

    let requestBody: GenerateAIContentRequest;
    try {
      requestBody = parseGenerateRequest(await req.json());
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Invalid request body.' },
        { status: 400 },
      );
    }

    const { prompt, mode, subtype } = requestBody;
    capturedMode = mode;
    capturedSubtype = subtype;

    trackAIGenerationStarted({ mode, subtype });

    const promptConfig = resolvePromptConfig(mode, subtype);
    const finalPrompt = buildGenerationPrompt(promptConfig.systemPrompt, prompt);

    let raw: string;
    try {
      raw = await callDeepSeek(finalPrompt);
    } catch (error) {
      trackAIGenerationFailed({
        mode,
        subtype,
        stage: 'provider',
        reason: error instanceof Error ? error.message : 'DeepSeek call failed.',
      });
      return NextResponse.json(
        {
          error: 'AI provider failed to return usable output.',
          details: error instanceof Error ? error.message : 'DeepSeek call failed.',
        },
        { status: 502 },
      );
    }

    let parsed: unknown;
    try {
      parsed = parseModelJson(raw);
    } catch (error) {
      trackAIGenerationFailed({
        mode,
        subtype,
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

    const normalized = injectStructuralMetadata(parsed, mode, subtype, promptConfig.renderer, prompt);

    const validation = safeValidateAIContentWithSubtypeCheck({
      mode,
      subtype,
      data: normalized,
    });

    if (!validation.success) {
      const validationErrorBody = validation.error instanceof ZodError
        ? createValidationError(validation.error)
        : validation.error.message;

      trackAIValidationFailed({
        mode,
        subtype,
        reason: validation.error instanceof ZodError
          ? validation.error.message
          : validation.error.message,
      });

      if (validation.error instanceof ZodError) {
        return NextResponse.json(
          { error: validationErrorBody },
          { status: 422 },
        );
      }

      return NextResponse.json(
        { error: validationErrorBody },
        { status: 400 },
      );
    }

    let enrichedData = validation.data;
    if (promptConfig.mode.requiresImages) {
      try {
        enrichedData = await enrichAIContentImages({
          mode,
          data: validation.data,
        });
      } catch (error) {
        trackAIEnrichmentFailed({
          mode,
          reason: error instanceof Error ? error.message : 'Enrichment failed.',
        });
      }
    }

    const envelope: StoredAIContent = {
      mode,
      version: 1,
      data: enrichedData,
      meta: {
        renderer: promptConfig.renderer,
        subtype,
        prompt,
        createdAt: new Date().toISOString(),
      },
    };

    trackAIGenerationSucceeded({ mode, subtype, contentType: enrichedData.type });

    return NextResponse.json(envelope);
  } catch (error) {
    trackAIGenerationFailed({
      mode: capturedMode,
      subtype: capturedSubtype,
      stage: 'request',
      reason: error instanceof Error ? error.message : 'Unexpected error.',
    });
    console.error('AI Component Generation Error:', error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unexpected error.',
      },
      { status: 500 },
    );
  }
}
