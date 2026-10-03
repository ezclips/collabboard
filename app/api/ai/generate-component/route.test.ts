import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * PATCH-236 Addendum 2. The generate-component route refuses the infographic
 * subtype (an empty-prompt design that Show options produces, never a direct
 * request) with the same 400 an unknown subtype gets -- and never calls the model.
 */
const h = vi.hoisted(() => ({ getUser: vi.fn(), generate: vi.fn() }));

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
  return { generateComponentText: h.generate, ComponentCreditRefusal, COMPONENT_MAX_TOKENS: 4000 };
});

import { POST } from './route';

let ip = 0;
function makeRequest(body: unknown): NextRequest {
  ip += 1;
  return new NextRequest('http://localhost/api/ai/generate-component', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${ip}` },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  h.generate.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe('PATCH-236 generate-component refuses infographic', () => {
  it('subtype "infographic" -> 400 and the model is never called', async () => {
    const res = await POST(makeRequest({ prompt: 'x', mode: 'diagram', subtype: 'infographic' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Diagram subtype is required.');
    expect(h.generate).not.toHaveBeenCalled();
  });
});

describe('PATCH-272 generate-component strips server-only model fields', () => {
  it('drops kicker, valuesEstimated, valuesExample and elementOverrides from the model reply', async () => {
    h.generate.mockResolvedValue({
      text: JSON.stringify({
        title: 'Water cycle',
        code: 'mindmap\n  root((Water cycle))',
        kicker: 'MODEL',
        valuesEstimated: true,
        valuesExample: true,
        elementOverrides: { template: 'list-grid-badge-card', items: { 'item-label@0': { dx: 12 } } },
        elementOverridesByTemplate: {
          'list-grid-badge-card': { template: 'list-grid-badge-card', items: { 'item-label@0': { dx: 12 } } },
        },
      }),
      generatedBy: { source: 'collabboard-default', model: 'm' },
    });

    const res = await POST(makeRequest({ prompt: 'Water cycle', mode: 'diagram', subtype: 'mindmap' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.kicker).toBeUndefined();
    expect(body.data.valuesEstimated).toBeUndefined();
    expect(body.data.valuesExample).toBeUndefined();
    expect(body.data.elementOverrides).toBeUndefined();
    expect(body.data.elementOverridesByTemplate).toBeUndefined();
  });
});
