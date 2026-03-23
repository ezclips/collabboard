import { NextResponse } from 'next/server';

import type { AIMode, DiagramSubtype } from '@/lib/ai/contracts';
import { MODE_REGISTRY } from '@/lib/ai/mode-registry';
import { DIAGRAM_SUBTYPE_SCHEMAS } from '@/lib/ai/validators';
import { trackAIAutoModeSelected } from '@/lib/ai/telemetry';

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

async function callDeepSeek(prompt: string): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not configured');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

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
        {
          role: 'user',
          content: `${CLASSIFY_SYSTEM_PROMPT}\n\nUser prompt:\n${prompt}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 80,
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

export async function POST(req: Request) {
  try {
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

    let raw: string;
    try {
      raw = await callDeepSeek(prompt.trim());
    } catch (error) {
      return NextResponse.json(
        { error: 'Classifier failed.', details: error instanceof Error ? error.message : 'Unknown error.' },
        { status: 502 },
      );
    }

    let result: ClassifyIntentResult;
    try {
      result = parseClassifyResponse(raw);
    } catch {
      // Safe fallback: return lesson_board low confidence rather than crashing
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
