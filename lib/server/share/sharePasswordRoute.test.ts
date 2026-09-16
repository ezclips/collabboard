import { createHash } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// app/api/** is outside vitest.config.ts's include globs, so the route modules
// are imported and exercised from here -- the same pattern as
// lib/server/boards/boardDeleteRoute.test.ts.

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'service-role-key-for-tests';

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));

let padletRoute: typeof import('../../../app/api/share-link/padlet/route');
let verifyRoute: typeof import('../../../app/api/share-link/verify-password/route');
let sharePassword: typeof import('./sharePassword');

const TOKEN = 'share-token-1';
const PADLET_ID = 'padlet-1';
const OTHER_PADLET_ID = 'padlet-2';
const BOARD_ID = 'board-1';
const PASSWORD = 'correct-horse-battery-staple';

const padletRow = {
    id: PADLET_ID,
    title: 'Secret post',
    content: 'confidential body',
    type: 'note',
    image_url: null,
    metadata: {},
    file_url: null,
};

interface ShareLinkRow {
    id: string;
    token: string;
    board_id: string | null;
    padlet_id: string | null;
    password_hash: string | null;
    expires_at: string | null;
    permission?: string | null;
    share_target?: string | null;
}

const updates: Array<Record<string, unknown>> = [];

let fixture: { link: ShareLinkRow | null; padletBoards: Record<string, string> } = {
    link: null,
    padletBoards: {},
};

/**
 * The routes capture `createClient(...)` once at module scope, so the fake must
 * be a stable object that reads a mutable fixture rather than a new client per
 * test. `padlets` rows are keyed by board so the board-scope check is real.
 */
function installFakeSupabase(link: ShareLinkRow | null, padletBoards: Record<string, string>) {
    fixture = { link, padletBoards };
}

const fakeClient = {
        from(table: string) {
            return {
                select(columns: string) {
                    const filters: Record<string, unknown> = {};
                    const chain = {
                        eq(column: string, value: unknown) {
                            filters[column] = value;
                            return chain;
                        },
                        async single() {
                            const { link, padletBoards } = fixture;
                            if (table === 'share_links') {
                                return link && filters.token === link.token
                                    ? { data: link, error: null }
                                    : { data: null, error: { code: 'PGRST116' } };
                            }

                            if (columns === 'id') {
                                const belongs = padletBoards[filters.id as string] === filters.board_id;
                                return belongs
                                    ? { data: { id: filters.id }, error: null }
                                    : { data: null, error: { code: 'PGRST116' } };
                            }

                            return filters.id === padletRow.id
                                ? { data: padletRow, error: null }
                                : { data: null, error: { code: 'PGRST116' } };
                        },
                    };
                    return chain;
                },
                update(payload: Record<string, unknown>) {
                    return {
                        async eq(column: string, value: unknown) {
                            updates.push({ ...payload, [column]: value });
                            return { error: null };
                        },
                    };
                },
            };
        },
};

function padletRequest(params: Record<string, string>) {
    const query = new URLSearchParams(params);
    return new NextRequest(`http://localhost/api/share-link/padlet?${query.toString()}`);
}

function verifyRequest(body: Record<string, unknown>) {
    return new NextRequest('http://localhost/api/share-link/verify-password', {
        method: 'POST',
        body: JSON.stringify(body),
    });
}

function protectedLink(passwordHash: string, overrides: Partial<ShareLinkRow> = {}): ShareLinkRow {
    return {
        id: 'link-1',
        token: TOKEN,
        board_id: null,
        padlet_id: PADLET_ID,
        password_hash: passwordHash,
        expires_at: null,
        ...overrides,
    };
}

beforeEach(async () => {
    vi.clearAllMocks();
    // Must be set before the route modules are first imported: they call
    // createClient at module scope and hold the result for the process.
    mocks.createClient.mockReturnValue(fakeClient);
    updates.length = 0;
    sharePassword = await import('./sharePassword');
    padletRoute = await import('../../../app/api/share-link/padlet/route');
    verifyRoute = await import('../../../app/api/share-link/verify-password/route');
});

describe('share-link password gate', () => {
    it('returns no content for a password-protected link when only the token is supplied', async () => {
        const hash = await sharePassword.hashSharePassword(PASSWORD);
        installFakeSupabase(protectedLink(hash), { [PADLET_ID]: BOARD_ID });

        const response = await padletRoute.GET(
            padletRequest({ token: TOKEN, padletId: PADLET_ID }),
        );

        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('issues no grant for a wrong password', async () => {
        const hash = await sharePassword.hashSharePassword(PASSWORD);
        installFakeSupabase(protectedLink(hash), { [PADLET_ID]: BOARD_ID });

        const response = await verifyRoute.POST(
            verifyRequest({ token: TOKEN, password: 'not-the-password', padletId: PADLET_ID }),
        );

        await expect(response.json()).resolves.toEqual({ valid: false });
    });

    it('returns content for the granted padlet only', async () => {
        const hash = await sharePassword.hashSharePassword(PASSWORD);
        installFakeSupabase(protectedLink(hash), { [PADLET_ID]: BOARD_ID });

        const verified = await verifyRoute.POST(
            verifyRequest({ token: TOKEN, password: PASSWORD, padletId: PADLET_ID }),
        );
        const { valid, grant } = await verified.json();

        expect(valid).toBe(true);
        expect(typeof grant).toBe('string');

        const granted = await padletRoute.GET(
            padletRequest({ token: TOKEN, padletId: PADLET_ID, grant }),
        );
        expect(granted.status).toBe(200);
        await expect(granted.json()).resolves.toEqual({ padlet: padletRow });

        // The same grant must not unlock a different padlet.
        const reused = await padletRoute.GET(
            padletRequest({ token: TOKEN, padletId: OTHER_PADLET_ID, grant }),
        );
        expect(reused.status).toBe(403);
    });

    it('rejects a padlet outside the board scope of a board-scoped grant', async () => {
        const hash = await sharePassword.hashSharePassword(PASSWORD);
        installFakeSupabase(
            protectedLink(hash, { board_id: BOARD_ID, padlet_id: null }),
            { [PADLET_ID]: BOARD_ID, [OTHER_PADLET_ID]: 'board-2' },
        );

        const grant = sharePassword.issueShareGrant({
            token: TOKEN,
            padletId: OTHER_PADLET_ID,
        });

        const response = await padletRoute.GET(
            padletRequest({ token: TOKEN, padletId: OTHER_PADLET_ID, grant }),
        );

        expect(response.status).toBe(403);
    });

    it('rejects an expired grant', async () => {
        const hash = await sharePassword.hashSharePassword(PASSWORD);
        installFakeSupabase(protectedLink(hash), { [PADLET_ID]: BOARD_ID });

        const grant = sharePassword.issueShareGrant({
            token: TOKEN,
            padletId: PADLET_ID,
            now: Date.now() - 60 * 60 * 1000,
        });

        const response = await padletRoute.GET(
            padletRequest({ token: TOKEN, padletId: PADLET_ID, grant }),
        );

        expect(response.status).toBe(403);
    });

    it('upgrades a legacy SHA-256 hash after a successful unlock', async () => {
        const legacy = createHash('sha256').update(PASSWORD).digest('hex');
        installFakeSupabase(protectedLink(legacy), { [PADLET_ID]: BOARD_ID });

        const response = await verifyRoute.POST(
            verifyRequest({ token: TOKEN, password: PASSWORD, padletId: PADLET_ID }),
        );

        await expect(response.json()).resolves.toMatchObject({ valid: true });
        expect(updates).toHaveLength(1);
        expect(String(updates[0].password_hash)).toMatch(/^scrypt\$/);
        expect(updates[0].id).toBe('link-1');
    });

    it('leaves links without a password unaffected', async () => {
        installFakeSupabase(protectedLink(null as unknown as string), {
            [PADLET_ID]: BOARD_ID,
        });

        const response = await padletRoute.GET(
            padletRequest({ token: TOKEN, padletId: PADLET_ID }),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ padlet: padletRow });
    });
});
