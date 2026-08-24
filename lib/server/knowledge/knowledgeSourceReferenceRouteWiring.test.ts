import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The F4-A review's blocking requirement was that this route compose the
 * AUTHENTICATED session client, never an admin one, so source_references RLS
 * still evaluates on the insert. That is proven twice here: by capturing the
 * real constructor arguments at runtime, and by scanning the production source
 * for elevated-authority imports that a mock could never reveal.
 */
const ROUTE_PATH = 'app/api/boards/[id]/knowledge/references/route.ts';
const routeSource = readFileSync(resolve(process.cwd(), ROUTE_PATH), 'utf8');
const routeCode = routeSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

type SessionDependencies = {
  getAuthenticatedSession(): Promise<{ userId: string; createSourceReference: unknown } | null>;
};

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createRouteHandlerClient: vi.fn(),
  authorizerArgs: [] as unknown[],
  repositoryArgs: [] as unknown[],
  writerArgs: [] as unknown[],
  commandDeps: [] as unknown[],
  capturedDeps: { value: null as SessionDependencies | null },
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('@supabase/auth-helpers-nextjs', () => ({ createRouteHandlerClient: mocks.createRouteHandlerClient }));
vi.mock('@/lib/infra/knowledge/knowledgeSourceReferenceWriteAdapters', () => ({
  SupabaseKnowledgeSourceReferenceWriteAuthorizer: class { constructor(client: unknown) { mocks.authorizerArgs.push(client); } },
  SupabaseKnowledgeSourceReferenceValidationRepository: class { constructor(client: unknown) { mocks.repositoryArgs.push(client); } },
  SupabaseKnowledgeSourceReferenceWriter: class { constructor(client: unknown) { mocks.writerArgs.push(client); } },
  nodeKnowledgeQuoteHasher: { hashQuoteText: (text: string) => `hash(${text})` },
}));
vi.mock('@/lib/domain/knowledge/knowledgeSourceReferenceWrite', () => ({
  createCreateKnowledgeSourceReferenceCommand: (deps: unknown) => {
    mocks.commandDeps.push(deps);
    return async () => ({ ok: true, value: {} });
  },
}));
vi.mock('@/lib/server/knowledge/knowledgeSourceReferenceRoute', () => ({
  createKnowledgeSourceReferencePostHandler: (deps: SessionDependencies) => {
    mocks.capturedDeps.value = deps;
    return async () => Response.json({ ok: true });
  },
}));

describe('P6J-F4-B production route wiring', () => {
  beforeEach(() => {
    mocks.authorizerArgs.length = 0;
    mocks.repositoryArgs.length = 0;
    mocks.writerArgs.length = 0;
    mocks.commandDeps.length = 0;
    vi.resetModules();
  });

  async function loadRoute(user: { id: string } | null, error: unknown = null) {
    const sessionClient = {
      auth: { getUser: vi.fn(async () => ({ data: { user }, error })) },
      marker: Symbol('authenticated-session-client'),
    };
    mocks.cookies.mockResolvedValue({ get: vi.fn() });
    mocks.createRouteHandlerClient.mockReturnValue(sessionClient);
    const routeModule = await import('@/app/api/boards/[id]/knowledge/references/route');
    return { routeModule, sessionClient };
  }

  it('exports POST from the injected server handler on the nodejs runtime', async () => {
    const { routeModule } = await loadRoute({ id: 'user-1' });

    expect(typeof routeModule.POST).toBe('function');
    expect(routeModule.runtime).toBe('nodejs');
    expect(mocks.capturedDeps.value).not.toBeNull();
  });

  it('authenticates through the route-handler client and returns no session without a user', async () => {
    const { sessionClient } = await loadRoute(null);

    const session = await mocks.capturedDeps.value!.getAuthenticatedSession();

    expect(mocks.createRouteHandlerClient).toHaveBeenCalled();
    expect(sessionClient.auth.getUser).toHaveBeenCalled();
    expect(session).toBeNull();
    // Nothing is constructed for an unauthenticated caller.
    expect(mocks.authorizerArgs).toHaveLength(0);
    expect(mocks.writerArgs).toHaveLength(0);
  });

  it('returns no session when auth reports an error even if a user object is present', async () => {
    await loadRoute({ id: 'user-1' }, { message: 'jwt expired' });

    await expect(mocks.capturedDeps.value!.getAuthenticatedSession()).resolves.toBeNull();
    expect(mocks.writerArgs).toHaveLength(0);
  });

  it('gives all three Supabase adapters the same authenticated session client', async () => {
    const { sessionClient } = await loadRoute({ id: 'user-1' });

    const session = await mocks.capturedDeps.value!.getAuthenticatedSession();

    expect(session?.userId).toBe('user-1');
    expect(mocks.authorizerArgs).toHaveLength(1);
    expect(mocks.repositoryArgs).toHaveLength(1);
    expect(mocks.writerArgs).toHaveLength(1);
    // Object identity, not merely shape: one authority for every lookup and the insert.
    expect(mocks.authorizerArgs[0]).toBe(sessionClient);
    expect(mocks.repositoryArgs[0]).toBe(sessionClient);
    expect(mocks.writerArgs[0]).toBe(sessionClient);
  });

  it('composes the domain command with those adapters and the Node hasher', async () => {
    await loadRoute({ id: 'user-1' });

    const session = await mocks.capturedDeps.value!.getAuthenticatedSession();

    expect(mocks.commandDeps).toHaveLength(1);
    const deps = mocks.commandDeps[0] as Record<string, unknown>;
    expect(Object.keys(deps).sort()).toEqual(['authorizer', 'hasher', 'repository', 'writer']);
    expect(deps.hasher).toHaveProperty('hashQuoteText');
    expect(typeof session?.createSourceReference).toBe('function');
  });

  it('never reaches for elevated authority in production source', () => {
    for (const forbidden of [
      'getSupabaseAdmin',
      '@/lib/supabase/admin',
      'lib/supabase/admin',
      'service_role',
      'serviceRole',
      'SUPABASE_SERVICE_ROLE_KEY',
      'createClient(',
    ]) {
      expect(routeCode, forbidden).not.toContain(forbidden);
    }
    expect(routeCode).toContain('createRouteHandlerClient');
    expect(routeCode).toContain('auth.getUser()');
    expect(routeCode).toContain("export const runtime = 'nodejs'");
  });

  it('passes one single client variable to each adapter in the source', () => {
    for (const construction of [
      'new SupabaseKnowledgeSourceReferenceWriteAuthorizer(writeClient)',
      'new SupabaseKnowledgeSourceReferenceValidationRepository(writeClient)',
      'new SupabaseKnowledgeSourceReferenceWriter(writeClient)',
    ]) {
      expect(routeCode).toContain(construction);
    }
    // That variable is the session client itself, only re-typed.
    expect(routeCode).toMatch(/const writeClient = sessionClient as unknown as/);
    expect(routeCode).toMatch(/const sessionClient = createKnowledgeRouteClient\(cookieStore\)/);
  });

  it('keeps the Node crypto hasher out of browser bundles', () => {
    // The composition surface is server-only, and no component imports it.
    expect(routeCode).not.toContain('node:crypto');
    const componentUsage = readFileSync(
      resolve(process.cwd(), 'components/collabboard/KnowledgeDocumentsList.tsx'),
      'utf8',
    );
    expect(componentUsage).not.toContain('knowledgeSourceReferenceWriteAdapters');
    expect(componentUsage).not.toContain('nodeKnowledgeQuoteHasher');
  });
});
