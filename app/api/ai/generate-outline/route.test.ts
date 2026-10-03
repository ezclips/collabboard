import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * PATCH-233. The outline route: signed-in only, validated body, credit refusal
 * mapping, a valid model reply -> { outline, generatedBy }, and the same
 * invalid-JSON status the component route uses (502).
 */

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  generate: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: async () => ({}) }));

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: () => ({ auth: { getUser: h.getUser } }),
}));

vi.mock('@/lib/server/ai/componentGeneration', () => {
  class ComponentCreditRefusal extends Error {
    status: number;
    code: string;
    constructor(status: number, message: string, code: string) {
      super(message);
      this.name = 'ComponentCreditRefusal';
      this.status = status;
      this.code = code;
    }
  }
  return {
    generateComponentText: h.generate,
    ComponentCreditRefusal,
    COMPONENT_MAX_TOKENS: 4000,
  };
});

import { POST } from './route';
import { OUTLINE_SYSTEM_PROMPT } from '@/lib/ai/outline';
import { ComponentCreditRefusal } from '@/lib/server/ai/componentGeneration';

let ipSeq = 0;
function makeRequest(body: unknown): NextRequest {
  ipSeq += 1;
  return new NextRequest('http://localhost/api/ai/generate-outline', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${ipSeq}` },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  h.generate.mockReset();
});
afterEach(() => {
  vi.clearAllMocks();
});

const VALID_OUTLINE = {
  title: 'Water cycle',
  ordered: false,
  items: [{ label: 'Evaporation' }, { label: 'Condensation' }],
};
const ATTR = { source: 'collabboard-default', model: 'm' };

describe('PATCH-233 POST /api/ai/generate-outline', () => {
  it('401 without a signed-in user', async () => {
    h.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest({ prompt: 'x' }));
    expect(res.status).toBe(401);
    expect(h.generate).not.toHaveBeenCalled();
  });

  it('400 on a missing prompt', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    expect(h.generate).not.toHaveBeenCalled();
  });

  it('maps a credit refusal to its own status and code', async () => {
    h.generate.mockRejectedValue(new ComponentCreditRefusal(402, 'No AI credits left', 'plan_limit_credits'));
    const res = await POST(makeRequest({ prompt: 'x' }));
    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe('plan_limit_credits');
  });

  it('returns { outline, generatedBy } for a valid model reply', async () => {
    h.generate.mockResolvedValue({ text: JSON.stringify(VALID_OUTLINE), generatedBy: ATTR });
    const res = await POST(makeRequest({ prompt: 'Water cycle' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.generatedBy).toEqual(ATTR);
    expect(body.outline.title).toBe('Water cycle');
    expect(body.outline.items).toHaveLength(2);
  });

  it('invalid model JSON is the same 502 the component route uses', async () => {
    h.generate.mockResolvedValue({ text: 'not json', generatedBy: ATTR });
    const res = await POST(makeRequest({ prompt: 'x' }));
    expect(res.status).toBe(502);
  });

  it('PATCH-254 runs the outline call without thinking', async () => {
    h.generate.mockResolvedValue({ text: JSON.stringify(VALID_OUTLINE), generatedBy: ATTR });
    await POST(makeRequest({ prompt: 'x' }));
    expect(h.generate.mock.calls[0][0]).toMatchObject({ reasoning: 'off' });
  });
});

describe('PATCH-237 generate-outline options', () => {
  const systemSent = () => String((h.generate.mock.calls[0][0] as { user: string }).user);

  it('rejects a bad detail value with 400', async () => {
    const res = await POST(makeRequest({ prompt: 'x', options: { detail: 'huge' } }));
    expect(res.status).toBe(400);
    expect(h.generate).not.toHaveBeenCalled();
  });

  it('rejects a visualHint over 60 chars with 400', async () => {
    const res = await POST(makeRequest({ prompt: 'x', options: { visualHint: 'a'.repeat(61) } }));
    expect(res.status).toBe(400);
    expect(h.generate).not.toHaveBeenCalled();
  });

  it('ignores unknown option keys', async () => {
    h.generate.mockResolvedValue({ text: JSON.stringify(VALID_OUTLINE), generatedBy: ATTR });
    const res = await POST(makeRequest({ prompt: 'x', options: { detail: 'summary', bogus: 1 } }));
    expect(res.status).toBe(200);
  });

  it('summary / detailed / keepWording each add exactly their fixed sentence', async () => {
    h.generate.mockResolvedValue({ text: JSON.stringify(VALID_OUTLINE), generatedBy: ATTR });

    await POST(makeRequest({ prompt: 'x', options: { detail: 'summary' } }));
    expect(systemSent()).toContain('Keep labels to at most 4 words and omit details unless essential.');

    h.generate.mockClear();
    h.generate.mockResolvedValue({ text: JSON.stringify(VALID_OUTLINE), generatedBy: ATTR });
    await POST(makeRequest({ prompt: 'x', options: { detail: 'detailed' } }));
    expect(systemSent()).toContain('Give every item a detail sentence (up to 140 characters).');

    h.generate.mockClear();
    h.generate.mockResolvedValue({ text: JSON.stringify(VALID_OUTLINE), generatedBy: ATTR });
    await POST(makeRequest({ prompt: 'x', options: { keepWording: true } }));
    expect(systemSent()).toContain("Use the user's own words for labels and details; do not paraphrase.");
  });

  it('a hint is sanitized inside quotes', async () => {
    h.generate.mockResolvedValue({ text: JSON.stringify(VALID_OUTLINE), generatedBy: ATTR });
    await POST(makeRequest({ prompt: 'x', options: { visualHint: 'py"ra\nmid' } }));
    const system = systemSent();
    expect(system).toContain('The user wants this drawn as: "pyra mid".');
    expect(system).not.toContain('py"ra');
  });

  it('no options leaves the system prompt byte-identical to before', async () => {
    h.generate.mockResolvedValue({ text: JSON.stringify(VALID_OUTLINE), generatedBy: ATTR });
    await POST(makeRequest({ prompt: 'x' }));
    // No "User preferences" block is appended when there are no options.
    expect(systemSent()).not.toContain('User preferences');
  });
});

describe('PATCH-250 generate-outline estimateValues', () => {
  const ESTIMATE_LINE =
    'The user asked for a chart. Give EVERY item a "value": your best estimate of its share in percent, based on the text, all values together about 100. This replaces the rule "Never invent a value" for this request.';
  const systemSent = () => String((h.generate.mock.calls[0][0] as { user: string }).user);
  const VALUED_OUTLINE = {
    title: 'Budget',
    ordered: false,
    items: [
      { label: 'Venue', value: 40 },
      { label: 'Food', value: 30 },
      { label: 'Travel', value: 20 },
    ],
  };

  it('rejects a non-boolean estimateValues with 400', async () => {
    const res = await POST(makeRequest({ prompt: 'x', options: { estimateValues: 'yes' } }));
    expect(res.status).toBe(400);
    expect(h.generate).not.toHaveBeenCalled();
  });

  it('estimateValues: true adds the fixed line to the prompt', async () => {
    h.generate.mockResolvedValue({ text: JSON.stringify(VALUED_OUTLINE), generatedBy: ATTR });
    await POST(makeRequest({ prompt: 'x', options: { estimateValues: true } }));
    expect(systemSent()).toContain(ESTIMATE_LINE);
  });

  it('no options leaves the prompt byte-identical', async () => {
    h.generate.mockResolvedValue({ text: JSON.stringify(VALID_OUTLINE), generatedBy: ATTR });
    await POST(makeRequest({ prompt: 'x' }));
    expect(systemSent()).toBe(`${OUTLINE_SYSTEM_PROMPT}\n\nUser request:\nx\n\nReturn valid JSON only.`);
  });

  it('with estimateValues and at least two values the outline is flagged', async () => {
    h.generate.mockResolvedValue({ text: JSON.stringify(VALUED_OUTLINE), generatedBy: ATTR });
    const res = await POST(makeRequest({ prompt: 'x', options: { estimateValues: true } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.outline.valuesEstimated).toBe(true);
  });

  it('with estimateValues and fewer than two values there is no flag', async () => {
    h.generate.mockResolvedValue({
      text: JSON.stringify({ title: 'T', items: [{ label: 'A', value: 60 }, { label: 'B' }] }),
      generatedBy: ATTR,
    });
    const res = await POST(makeRequest({ prompt: 'x', options: { estimateValues: true } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.outline.valuesEstimated).toBeUndefined();
  });

  it('a model-supplied valuesEstimated flag is dropped when the option is absent', async () => {
    h.generate.mockResolvedValue({
      text: JSON.stringify({ ...VALUED_OUTLINE, valuesEstimated: true }),
      generatedBy: ATTR,
    });
    const res = await POST(makeRequest({ prompt: 'x' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.outline.valuesEstimated).toBeUndefined();
  });
});

describe('PATCH-260 generate-outline strips model element overrides', () => {
  it('never returns the model\u2019s elementOverrides', async () => {
    h.generate.mockResolvedValue({
      text: JSON.stringify({
        ...VALID_OUTLINE,
        elementOverrides: { template: 'list-grid-badge-card', items: { 'title#0': { dx: 20 } } },
        elementOverridesByTemplate: {
          'list-grid-badge-card': { template: 'list-grid-badge-card', items: { 'title#0': { dx: 20 } } },
        },
      }),
      generatedBy: ATTR,
    });
    const res = await POST(makeRequest({ prompt: 'x' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.outline.elementOverrides).toBeUndefined();
    expect(body.outline.elementOverridesByTemplate).toBeUndefined();
  });
});
