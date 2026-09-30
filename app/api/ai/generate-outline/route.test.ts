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
});
