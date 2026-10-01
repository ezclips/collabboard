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
