import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Mirrors lib/server/knowledge/knowledgeRouteAuthWiring.test.ts's pattern:
// app/api/** is outside vitest.config.ts's `include` globs (confirmed
// empirically -- `npx vitest run app/api/...` reports "No test files found"
// even for an explicit path), so the route module is imported and exercised
// from here instead, exactly like every other Next.js route test in this repo.
const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createRouteHandlerClient: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('@supabase/auth-helpers-nextjs', () => ({ createRouteHandlerClient: mocks.createRouteHandlerClient }));

let route: typeof import('../../../app/api/ai/text-action/route');
let ipCounter = 0;

function configureAuth(user: { id: string } | null) {
  mocks.cookies.mockResolvedValue({ get: vi.fn(() => null), set: vi.fn() });
  mocks.createRouteHandlerClient.mockReturnValue({
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
  });
}

function request(body: unknown, ip?: string) {
  ipCounter += 1;
  return new NextRequest('http://localhost/api/ai/text-action', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip ?? `10.0.0.${ipCounter}`,
    },
    body: JSON.stringify(body),
  });
}

function mockDeepSeekSuccess(content: string) {
  return vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }));
}

beforeAll(async () => {
  route = await import('../../../app/api/ai/text-action/route');
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('DEEPSEEK_API_KEY', 'test-deepseek-key');
  configureAuth({ id: 'user-1' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/ai/text-action -- auth', () => {
  it('1. unauthenticated request is rejected with 401', async () => {
    configureAuth(null);
    const res = await route.POST(request({ action: 'improve', selectedText: 'hello' }));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/ai/text-action -- request validation', () => {
  it('2. invalid action is rejected with 400', async () => {
    const res = await route.POST(request({ action: 'translate', selectedText: 'hello' }));
    expect(res.status).toBe(400);
  });

  it('3. empty selectedText is rejected with 400', async () => {
    const res = await route.POST(request({ action: 'improve', selectedText: '   ' }));
    expect(res.status).toBe(400);
  });

  it('4. selectedText over 4000 characters is rejected with 400', async () => {
    const res = await route.POST(request({ action: 'improve', selectedText: 'a'.repeat(4001) }));
    expect(res.status).toBe(400);
  });

  it('5. custom action without instruction is rejected with 400', async () => {
    const res = await route.POST(request({ action: 'custom', selectedText: 'hello' }));
    expect(res.status).toBe(400);
  });

  it('6. instruction supplied on a non-custom action is rejected with 400', async () => {
    const res = await route.POST(request({ action: 'improve', selectedText: 'hello', instruction: 'make it louder' }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/ai/text-action -- rate limiting', () => {
  it('7. the 11th request within the window from one IP is rejected with 429', async () => {
    vi.stubGlobal('fetch', mockDeepSeekSuccess('ok'));
    const ip = '203.0.113.7';
    for (let i = 0; i < 10; i++) {
      const res = await route.POST(request({ action: 'improve', selectedText: 'hello' }, ip));
      expect(res.status).toBe(200);
    }
    const eleventh = await route.POST(request({ action: 'improve', selectedText: 'hello' }, ip));
    expect(eleventh.status).toBe(429);
  });
});

describe('POST /api/ai/text-action -- provider failure', () => {
  it('8. a provider/network failure surfaces as 502, never a raw provider payload', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('secret internal detail'); }));
    const res = await route.POST(request({ action: 'improve', selectedText: 'hello' }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).not.toContain('secret internal detail');
  });

  it('9. a malformed provider response (no content field) is rejected with 502', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{}] }), { status: 200 })));
    const res = await route.POST(request({ action: 'improve', selectedText: 'hello' }));
    expect(res.status).toBe(502);
  });

  it('9b. an empty-after-trim provider response is rejected with 502', async () => {
    vi.stubGlobal('fetch', mockDeepSeekSuccess('   '));
    const res = await route.POST(request({ action: 'improve', selectedText: 'hello' }));
    expect(res.status).toBe(502);
  });
});

describe('POST /api/ai/text-action -- success', () => {
  it('10. a successful request returns { text: string } only', async () => {
    vi.stubGlobal('fetch', mockDeepSeekSuccess('Better text'));
    const res = await route.POST(request({ action: 'improve', selectedText: 'Bravo' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ text: 'Better text' });
  });

  it('11. the exact selectedText reaches the provider prompt verbatim', async () => {
    const fetchMock = mockDeepSeekSuccess('ok');
    vi.stubGlobal('fetch', fetchMock);
    await route.POST(request({ action: 'improve', selectedText: 'Exact Bravo Text' }));
    const [, init] = fetchMock.mock.calls[0];
    const sentBody = JSON.parse((init as RequestInit).body as string);
    const userMessage = sentBody.messages.find((m: { role: string }) => m.role === 'user');
    expect(userMessage.content).toBe('Exact Bravo Text');
  });

  it('12. the provider request contains only the system prompt + selectedText -- no board/Note/Document/Knowledge content', async () => {
    const fetchMock = mockDeepSeekSuccess('ok');
    vi.stubGlobal('fetch', fetchMock);
    await route.POST(request({ action: 'shorten', selectedText: 'Bravo' }));
    const [, init] = fetchMock.mock.calls[0];
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.messages).toHaveLength(2);
    expect(Object.keys(sentBody).sort()).toEqual(['max_tokens', 'messages', 'model', 'temperature']);
  });

  it('shorten and fix-grammar route to their own distinct task instructions', async () => {
    const fetchMock = mockDeepSeekSuccess('ok');
    vi.stubGlobal('fetch', fetchMock);
    await route.POST(request({ action: 'shorten', selectedText: 'Bravo' }));
    await route.POST(request({ action: 'fix-grammar', selectedText: 'Bravo' }));
    const systemPrompts = fetchMock.mock.calls.map(([, init]: any[]) => {
      const body = JSON.parse((init as RequestInit).body as string);
      return body.messages.find((m: { role: string }) => m.role === 'system').content;
    });
    expect(systemPrompts[0]).not.toBe(systemPrompts[1]);
  });

  it('custom action forwards the trimmed instruction into the system prompt', async () => {
    const fetchMock = mockDeepSeekSuccess('ok');
    vi.stubGlobal('fetch', fetchMock);
    await route.POST(request({ action: 'custom', selectedText: 'Bravo', instruction: '  translate to pirate speak  ' }));
    const [, init] = fetchMock.mock.calls[0];
    const sentBody = JSON.parse((init as RequestInit).body as string);
    const systemMessage = sentBody.messages.find((m: { role: string }) => m.role === 'system');
    expect(systemMessage.content).toContain('translate to pirate speak');
  });
});

describe('POST /api/ai/text-action -- scope and secret handling', () => {
  // Strips comments so this tests what the route DOES, not its own prose --
  // the route's rate-limit comment names the sibling routes by way of
  // explaining it copies their shape, which must not trip this guard.
  const routeCode = () =>
    readFileSync(resolve(process.cwd(), 'app/api/ai/text-action/route.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('13. never imports the structured-component contract, mode registry, or another AI endpoint', () => {
    const source = routeCode();
    expect(source).not.toContain('lib/ai/contracts');
    expect(source).not.toContain('mode-registry');
    expect(source).not.toContain('generate-component');
    expect(source).not.toContain('convert-component');
    expect(source).not.toContain('classify-intent');
    expect(source).not.toContain('AIMode');
    expect(source).not.toContain('StoredAIContent');
  });

  it('14. the API key value never appears in a response body', async () => {
    vi.stubGlobal('fetch', mockDeepSeekSuccess('ok'));
    const res = await route.POST(request({ action: 'improve', selectedText: 'hello' }));
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain('test-deepseek-key');
  });

  it('14b. a missing API key never leaks the env var name to the client', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', '');
    const res = await route.POST(request({ action: 'improve', selectedText: 'hello' }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).not.toContain('DEEPSEEK_API_KEY');
  });
});
