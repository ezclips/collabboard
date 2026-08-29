import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

import {
  isTextAction,
  TEXT_ACTION_INSTRUCTION_MAX,
  TEXT_ACTION_SELECTED_TEXT_MAX,
  type TextAction,
} from '@/lib/ai/textActions';

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

async function callDeepSeek(systemPrompt: string, selectedText: string): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not configured');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);

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
        { role: 'system', content: systemPrompt },
        { role: 'user', content: selectedText },
      ],
      temperature: 0.3,
      max_tokens: 1500,
    }),
  }).finally(() => clearTimeout(timer));

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`DeepSeek error: ${err}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('DeepSeek returned an empty response.');
  return content;
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

    const { action, selectedText, instruction } = body as Record<string, unknown>;

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

    const trimmedInstruction = action === 'custom' ? (instruction as string).trim() : undefined;
    const systemPrompt = buildSystemPrompt(action, trimmedInstruction);

    let raw: string;
    try {
      raw = await callDeepSeek(systemPrompt, selectedText.trim());
    } catch {
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
