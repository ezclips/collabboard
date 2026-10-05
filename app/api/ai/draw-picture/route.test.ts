import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * PATCH-283 H. The AI-drawn picture route: signed-in only, validated body, one
 * generation call, one optional auditor call, and the same provider/credit error
 * mapping the other AI routes use.
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
  return new NextRequest('http://localhost/api/ai/draw-picture', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.1.0.${ipSeq}` },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  h.generate.mockReset();
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

const OUTLINE = {
  title: 'Budget',
  ordered: false,
  kind: 'parts',
  items: [
    { label: 'Venue', value: 40 },
    { label: 'Food', value: 60 },
  ],
};
const ATTR = { source: 'collabboard-default', model: 'm' };

const VALID_PICTURE = {
  version: 1,
  width: 800,
  height: 600,
  background: '#ffffff',
  elements: [
    { id: 'r', type: 'rect', x: 0, y: 0, w: 100, h: 50, fill: '#aabbcc', stroke: '#000000' },
    { id: 'lbl', type: 'text', text: 'Venue Food', x: 0, y: 0, w: 80, size: 16, color: '#111111', in: 'r' },
  ],
};

const OVERLAP_PICTURE = {
  version: 1,
  width: 800,
  height: 600,
  background: '#ffffff',
  elements: [
    { id: 'a', type: 'bar', item: 5, x: 40, y: 40, w: 100, h: 80, orient: 'v', fill: '#aabbcc' },
    { id: 'b', type: 'bar', item: 6, x: 60, y: 60, w: 100, h: 80, orient: 'v', fill: '#aabbcc' },
    { id: 'la', type: 'text', text: 'Venue', x: 40, y: 40, w: 60, size: 16, color: '#111111' },
    { id: 'lb', type: 'text', text: 'Food', x: 200, y: 40, w: 60, size: 16, color: '#111111' },
  ],
};

describe('PATCH-283 POST /api/ai/draw-picture', () => {
  it('401 without a signed-in user', async () => {
    h.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest({ outline: OUTLINE, kind: 'pie', seed: 0 }));
    expect(res.status).toBe(401);
    expect(h.generate).not.toHaveBeenCalled();
  });

  it('400 on a bad kind', async () => {
    const res = await POST(makeRequest({ outline: OUTLINE, kind: 'scatter', seed: 0 }));
    expect(res.status).toBe(400);
  });

  it('400 on a bad seed', async () => {
    const res = await POST(makeRequest({ outline: OUTLINE, kind: 'pie', seed: 99_999 }));
    expect(res.status).toBe(400);
  });

  it('200 with a repaired picture for a valid model reply', async () => {
    h.generate.mockResolvedValue({ text: JSON.stringify(VALID_PICTURE), generatedBy: ATTR });
    const res = await POST(makeRequest({ outline: OUTLINE, kind: 'pie', seed: 1 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.generatedBy).toEqual(ATTR);
    expect(body.kind).toBe('pie');
    expect(body.variant).toBe(1);
    expect(body.attempts).toBe(1);
    expect(body.picture.elements.length).toBeGreaterThan(0);
    expect(h.generate).toHaveBeenCalledTimes(1);
  });

  it('502 on invalid model JSON', async () => {
    h.generate.mockResolvedValue({ text: 'not json', generatedBy: ATTR });
    const res = await POST(makeRequest({ outline: OUTLINE, kind: 'pie', seed: 0 }));
    expect(res.status).toBe(502);
  });

  it('makes exactly one auditor call with the issue list when issues are found', async () => {
    h.generate
      .mockResolvedValueOnce({ text: JSON.stringify(OVERLAP_PICTURE), generatedBy: ATTR })
      .mockResolvedValueOnce({ text: JSON.stringify(OVERLAP_PICTURE), generatedBy: ATTR });
    const res = await POST(makeRequest({ outline: OUTLINE, kind: 'pie', seed: 0 }));
    expect(res.status).toBe(200);
    expect(h.generate).toHaveBeenCalledTimes(2);
    const secondUser = String((h.generate.mock.calls[1][0] as { user: string }).user);
    expect(secondUser).toContain('overlap');
    expect((await res.json()).attempts).toBe(2);
  });

  it('honours reasoning: auto only outside production', async () => {
    h.generate.mockResolvedValue({ text: JSON.stringify(VALID_PICTURE), generatedBy: ATTR });
    await POST(makeRequest({ outline: OUTLINE, kind: 'pie', seed: 0, reasoning: 'auto' }));
    expect((h.generate.mock.calls[0][0] as { reasoning?: string }).reasoning).not.toBe('off');

    h.generate.mockReset();
    h.generate.mockResolvedValue({ text: JSON.stringify(VALID_PICTURE), generatedBy: ATTR });
    vi.stubEnv('NODE_ENV', 'production');
    await POST(makeRequest({ outline: OUTLINE, kind: 'pie', seed: 0, reasoning: 'auto' }));
    expect((h.generate.mock.calls[0][0] as { reasoning?: string }).reasoning).toBe('off');
  });

  it('maps a credit refusal to its own status and code', async () => {
    h.generate.mockRejectedValue(new ComponentCreditRefusal(402, 'No AI credits left', 'plan_limit_credits'));
    const res = await POST(makeRequest({ outline: OUTLINE, kind: 'pie', seed: 0 }));
    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe('plan_limit_credits');
  });
});
