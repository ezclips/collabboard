import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * PATCH-272. The convert route strips the outline's server-only fields from the
 * model's reply, exactly like generate-component.
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
  return new NextRequest('http://localhost/api/ai/convert-component', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.1.${ip}` },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  h.generate.mockReset();
});
afterEach(() => vi.clearAllMocks());

const SOURCE = {
  mode: 'diagram',
  version: 1,
  data: {
    type: 'diagram',
    subtype: 'mindmap',
    renderer: 'diagram_code',
    title: 'Water cycle',
    code: 'mindmap\n  root((Water cycle))',
  },
};

describe('PATCH-272 convert-component strips server-only model fields', () => {
  it('drops kicker, valuesEstimated, valuesExample and elementOverrides from the model reply', async () => {
    h.generate.mockResolvedValue({
      text: JSON.stringify({
        title: 'Flow',
        code: 'flowchart LR\n  A --> B',
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

    const res = await POST(makeRequest({
      sourceEnvelope: SOURCE,
      targetMode: 'diagram',
      targetSubtype: 'flowchart',
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.kicker).toBeUndefined();
    expect(body.data.valuesEstimated).toBeUndefined();
    expect(body.data.valuesExample).toBeUndefined();
    expect(body.data.elementOverrides).toBeUndefined();
    expect(body.data.elementOverridesByTemplate).toBeUndefined();
  });
});
