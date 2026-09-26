import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import {
  aiCreditBalance,
  aiCreditPeriod,
  PLANS,
} from '../../domain/billing/plans';
import { AI_ROLE_CHAT } from '../../ai/aiRoles';
import {
  allowByokFor,
  checkAiActionCredits,
  checkBoardAiCredits,
  checkManagedAiCredits,
  readAiCreditBalance,
  recordAiCreditUsage,
} from './aiCredits';
import type { BoardPlan } from './boardPlan';

const adminMocks = vi.hoisted(() => ({ getSupabaseAdmin: vi.fn() }));
vi.mock('../../supabase/admin', () => ({ getSupabaseAdmin: adminMocks.getSupabaseAdmin }));

/**
 * PATCH-187. The ledger, with an injected client so no test reaches a real
 * database. What is asserted: the check's decision and its refusal body, that a
 * read error throws, and that recording writes exactly the rows a split says.
 */

const WORKSPACE = '11111111-1111-4111-8111-111111111111';
const BOARD = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';

function makeAdmin(handlers: {
  board?: { data: unknown; error: unknown };
  subscription?: { data: unknown; error: unknown };
  /** PATCH-189. The workspace's `created_at`, read to decide the trial. */
  workspace?: { data: unknown; error: unknown };
  allowance?: { data: unknown; error: unknown };
  grant?: { data: unknown; error: unknown };
  insertError?: unknown;
} = {}) {
  const inserts: unknown[][] = [];
  const aiFilters: unknown[][] = [];

  const from = vi.fn((table: string) => {
    if (table === 'boards') {
      const builder = {
        eq: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => handlers.board ?? { data: { workspace_id: WORKSPACE }, error: null }),
      };
      return { select: vi.fn(() => builder) };
    }
    if (table === 'subscriptions') {
      const builder = {
        eq: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => handlers.subscription ?? { data: null, error: null }),
      };
      return { select: vi.fn(() => builder) };
    }
    if (table === 'workspaces') {
      const builder = {
        eq: vi.fn(() => builder),
        // PATCH-189. Default: no `created_at`, so no trial -- the pre-PATCH-189
        // behaviour for every existing case here.
        maybeSingle: vi.fn(async () => handlers.workspace ?? { data: { created_at: null }, error: null }),
      };
      return { select: vi.fn(() => builder) };
    }
    if (table === 'ai_credit_usage') {
      return {
        select: vi.fn(() => {
          let bucket: string | null = null;
          const builder = {
            eq: vi.fn((column: string, value: unknown) => {
              aiFilters.push([column, value]);
              if (column === 'bucket') bucket = String(value);
              return builder;
            }),
            gte: vi.fn((column: string, value: unknown) => {
              aiFilters.push([column, value]);
              return Promise.resolve(
                bucket === 'allowance' ? (handlers.allowance ?? { data: [], error: null }) : (handlers.grant ?? { data: [], error: null }),
              );
            }),
            then: (
              resolve: (value: unknown) => unknown,
              reject: (reason: unknown) => unknown,
            ) => Promise.resolve(
              bucket === 'allowance' ? (handlers.allowance ?? { data: [], error: null }) : (handlers.grant ?? { data: [], error: null }),
            ).then(resolve, reject),
          };
          return builder;
        }),
        insert: vi.fn((rows: unknown[]) => {
          inserts.push(rows);
          return Promise.resolve({ error: handlers.insertError ?? null });
        }),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });

  return { client: { from } as unknown as SupabaseClient, inserts, aiFilters };
}

const proPlan = (period: BoardPlan['subscriptionPeriod']): BoardPlan => ({
  workspaceId: WORKSPACE,
  planId: 'pro',
  limits: PLANS.pro.limits,
  subscriptionPeriod: period,
  trial: null,
});
const freePlan = (): BoardPlan => ({
  workspaceId: WORKSPACE,
  planId: 'free',
  limits: PLANS.free.limits,
  subscriptionPeriod: null,
  trial: null,
});
// PATCH-189. Free is 0/0 now; the grant-bucket split is exercised with the
// shape the bucket exists for (an allowance plus a welcome grant).
const grantPlan = (): BoardPlan => ({
  ...freePlan(),
  limits: { ...PLANS.free.limits, monthlyAiCredits: 10, welcomeAiCredits: 30 },
});

const NOW = new Date('2026-09-15T12:00:00Z');

describe('checkManagedAiCredits', () => {
  it('allowed with charge true when the balance covers the cost', async () => {
    const { client } = makeAdmin({
      subscription: { data: { plan: 'pro', status: 'active', current_period_start: '2026-09-01T00:00:00Z', current_period_end: '2026-10-01T00:00:00Z' }, error: null },
      allowance: { data: [{ credits: 20 }], error: null },
    });

    const result = await checkManagedAiCredits(client, BOARD, NOW, 1);

    expect(result.kind).toBe('allowed');
    if (result.kind !== 'allowed') return;
    expect(result.charge).toBe(true);
    expect(result.balance.remaining).toBe(480);
  });

  it('refused 402 with plan_limit_credits and the renewal date', async () => {
    const { client } = makeAdmin({
      subscription: { data: null, error: null },
      allowance: { data: [{ credits: 10 }], error: null },
      grant: { data: [{ credits: 30 }], error: null },
    });

    const result = await checkManagedAiCredits(client, BOARD, NOW, 1);

    expect(result).toEqual({
      kind: 'refused',
      status: 402,
      body: {
        error: "The Free plan's AI credits for this month are used up. They renew on 1 October. Upgrade for more.",
        code: 'plan_limit_credits',
      },
    });
  });

  it('board chat out of credits: Pro is allowed uncharged, Free is refused', async () => {
    const pro = makeAdmin({
      subscription: { data: { plan: 'pro', status: 'active', current_period_start: '2026-09-01T00:00:00Z', current_period_end: '2026-10-01T00:00:00Z' }, error: null },
      allowance: { data: [{ credits: 500 }], error: null },
    });
    const proResult = await checkManagedAiCredits(pro.client, BOARD, NOW, 1, { boardChat: true });
    expect(proResult.kind).toBe('allowed');
    if (proResult.kind === 'allowed') expect(proResult.charge).toBe(false);

    const free = makeAdmin({
      subscription: { data: null, error: null },
      allowance: { data: [{ credits: 10 }], error: null },
      grant: { data: [{ credits: 30 }], error: null },
    });
    const freeResult = await checkManagedAiCredits(free.client, BOARD, NOW, 1, { boardChat: true });
    expect(freeResult.kind).toBe('refused');
    if (freeResult.kind === 'refused') expect(freeResult.body.code).toBe('plan_limit_credits');
  });

  it('no workspace: refused with plan_limit_no_workspace', async () => {
    const { client } = makeAdmin({
      board: { data: { workspace_id: null }, error: null },
    });

    const result = await checkManagedAiCredits(client, BOARD, NOW, 1);

    expect(result).toEqual({
      kind: 'refused',
      status: 402,
      body: {
        error: "This board isn't in a workspace, so it has no AI credits.",
        code: 'plan_limit_no_workspace',
      },
    });
  });

  it('a ledger read error THROWS', async () => {
    const { client } = makeAdmin({
      subscription: { data: { plan: 'pro', status: 'active' }, error: null },
      allowance: { data: null, error: { code: '57014', message: 'timeout' } },
    });

    await expect(checkManagedAiCredits(client, BOARD, NOW, 1)).rejects.toEqual({
      code: '57014',
      message: 'timeout',
    });
  });
});

describe('readAiCreditBalance', () => {
  it('sums the allowance within the period and the grant all time', async () => {
    const { client, aiFilters } = makeAdmin({
      allowance: { data: [{ credits: 3 }, { credits: 4 }], error: null },
      grant: { data: [{ credits: 5 }], error: null },
    });

    const balance = await readAiCreditBalance(client, proPlan({ start: '2026-09-01T00:00:00Z', end: '2026-10-01T00:00:00Z' }), NOW);

    expect(balance.allowanceUsed).toBe(7);
    expect(balance.grantUsed).toBe(5);
    // The allowance read is scoped to the period start.
    expect(aiFilters).toContainEqual(['created_at', '2026-09-01T00:00:00.000Z']);
  });
});

describe('recordAiCreditUsage', () => {
  const period = aiCreditPeriod(NOW, null);

  it('writes one row', async () => {
    const { client, inserts } = makeAdmin();
    const balance = aiCreditBalance(PLANS.free.limits, period, { allowanceUsed: 0, grantUsed: 0 });

    await recordAiCreditUsage(client, {
      plan: freePlan(), balance, boardId: BOARD, userId: USER, feature: 'board_chat', credits: 1,
    });

    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toEqual([{
      workspace_id: WORKSPACE,
      board_id: BOARD,
      user_id: USER,
      feature: 'board_chat',
      credits: 1,
      bucket: 'allowance',
    }]);
  });

  it('splits into two rows when the allowance runs out mid-charge', async () => {
    const { client, inserts } = makeAdmin();
    const plan = grantPlan();
    const balance = aiCreditBalance(plan.limits, period, { allowanceUsed: 9, grantUsed: 0 });

    await recordAiCreditUsage(client, {
      plan, balance, boardId: BOARD, userId: USER, feature: 'table_from_document', credits: 3,
    });

    expect(inserts[0]).toEqual([
      { workspace_id: WORKSPACE, board_id: BOARD, user_id: USER, feature: 'table_from_document', credits: 1, bucket: 'allowance' },
      { workspace_id: WORKSPACE, board_id: BOARD, user_id: USER, feature: 'table_from_document', credits: 2, bucket: 'grant' },
    ]);
  });

  it('0 credits inserts nothing', async () => {
    const { client, inserts } = makeAdmin();
    const balance = aiCreditBalance(PLANS.free.limits, period, { allowanceUsed: 0, grantUsed: 0 });

    await recordAiCreditUsage(client, {
      plan: freePlan(), balance, boardId: BOARD, userId: USER, feature: 'board_chat', credits: 0,
    });

    expect(inserts).toEqual([]);
  });
});

describe('checkBoardAiCredits', () => {
  const preferences = (connectionId: string | null) => ({
    getPreference: vi.fn(async () => ({ ok: true, value: { connectionId, modelId: null } }) as never),
  });

  it('a caller on their own key on a Premium board is byok, and the ledger is never read', async () => {
    const { client, aiFilters } = makeAdmin({
      subscription: { data: { plan: 'premium', status: 'active' }, error: null },
    });
    adminMocks.getSupabaseAdmin.mockReset().mockReturnValue(client);

    const decision = await checkBoardAiCredits({
      boardId: BOARD, userId: USER, role: AI_ROLE_CHAT, cost: 1, now: NOW,
      preferences: preferences('conn-1'),
    });

    expect(decision).toEqual({ kind: 'byok' });
    // PATCH-190: the plan IS read to decide, but the credit ledger is not.
    expect(adminMocks.getSupabaseAdmin).toHaveBeenCalledTimes(1);
    expect(aiFilters).toEqual([]);
  });

  it('a caller on their own key on a Pro board is managed and the ledger decides', async () => {
    const { client, aiFilters } = makeAdmin({
      subscription: { data: { plan: 'pro', status: 'active' }, error: null },
    });
    adminMocks.getSupabaseAdmin.mockReset().mockReturnValue(client);

    const decision = await checkBoardAiCredits({
      boardId: BOARD, userId: USER, role: AI_ROLE_CHAT, cost: 1, now: NOW,
      preferences: preferences('conn-1'),
    });

    expect(decision.kind).toBe('allowed');
    expect(adminMocks.getSupabaseAdmin).toHaveBeenCalledTimes(1);
    expect(aiFilters).toContainEqual(['workspace_id', WORKSPACE]);
  });

  it('a caller on their own key during the Premium trial is byok', async () => {
    const trialing = { data: { created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() }, error: null };
    const { client, aiFilters } = makeAdmin({ subscription: { data: null, error: null }, workspace: trialing });
    adminMocks.getSupabaseAdmin.mockReset().mockReturnValue(client);

    const decision = await checkBoardAiCredits({
      boardId: BOARD, userId: USER, role: AI_ROLE_CHAT, cost: 1, now: NOW,
      preferences: preferences('conn-1'),
    });

    expect(decision).toEqual({ kind: 'byok' });
    expect(aiFilters).toEqual([]);
  });

  it('a caller on their own key on Free after the trial is refused plan_limit_credits', async () => {
    const expired = { data: { created_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString() }, error: null };
    const { client } = makeAdmin({ subscription: { data: null, error: null }, workspace: expired });
    adminMocks.getSupabaseAdmin.mockReset().mockReturnValue(client);

    const decision = await checkBoardAiCredits({
      boardId: BOARD, userId: USER, role: AI_ROLE_CHAT, cost: 1, now: NOW,
      preferences: preferences('conn-1'),
    });

    expect(decision.kind).toBe('refused');
    if (decision.kind === 'refused') expect(decision.body.code).toBe('plan_limit_credits');
  });

  it('a managed caller reads the board owner ledger', async () => {
    // A paid plan: Free is 0 credits now, so an allowed decision needs one.
    const { client, aiFilters } = makeAdmin({
      subscription: { data: { plan: 'pro', status: 'active' }, error: null },
    });
    adminMocks.getSupabaseAdmin.mockReset().mockReturnValue(client);

    const decision = await checkBoardAiCredits({
      boardId: BOARD, userId: USER, role: AI_ROLE_CHAT, cost: 1, now: NOW,
      preferences: preferences(null),
    });

    expect(decision.kind).toBe('allowed');
    expect(adminMocks.getSupabaseAdmin).toHaveBeenCalledTimes(1);
    expect(aiFilters).toContainEqual(['workspace_id', WORKSPACE]);
  });
});

describe('checkAiActionCredits (PATCH-188)', () => {
  const preferences = (connectionId: string | null) => ({
    getPreference: vi.fn(async () => ({ ok: true, value: { connectionId, modelId: null } }) as never),
  });
  const canReadBoard = (value: boolean) => vi.fn(async () => value);

  it('configured byok with no board is refused plan_limit_no_board: the key cannot apply without a plan', async () => {
    adminMocks.getSupabaseAdmin.mockReset();
    const read = canReadBoard(true);

    const decision = await checkAiActionCredits({
      boardId: undefined, userId: USER, role: AI_ROLE_CHAT, cost: 1, now: NOW,
      preferences: preferences('conn-1'), canReadBoard: read,
    });

    expect(decision).toEqual({
      kind: 'refused',
      status: 402,
      body: {
        error: "This AI action isn't linked to a board, so it has no AI credits.",
        code: 'plan_limit_no_board',
      },
    });
    expect(read).not.toHaveBeenCalled();
    expect(adminMocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it('configured byok on an unreadable board is forbidden, with no plan read', async () => {
    adminMocks.getSupabaseAdmin.mockReset();

    const decision = await checkAiActionCredits({
      boardId: BOARD, userId: USER, role: AI_ROLE_CHAT, cost: 1, now: NOW,
      preferences: preferences('conn-1'), canReadBoard: canReadBoard(false),
    });

    expect(decision).toEqual({ kind: 'forbidden' });
    expect(adminMocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it('configured byok on a readable Pro board takes the managed decision', async () => {
    const { client, aiFilters } = makeAdmin({
      subscription: { data: { plan: 'pro', status: 'active' }, error: null },
    });
    adminMocks.getSupabaseAdmin.mockReset().mockReturnValue(client);

    const decision = await checkAiActionCredits({
      boardId: BOARD, userId: USER, role: AI_ROLE_CHAT, cost: 1, now: NOW,
      preferences: preferences('conn-1'), canReadBoard: canReadBoard(true),
    });

    expect(decision.kind).toBe('allowed');
    expect(aiFilters).toContainEqual(['workspace_id', WORKSPACE]);
  });

  it('configured byok on a readable Premium board is byok, with no ledger read', async () => {
    const { client, aiFilters } = makeAdmin({
      subscription: { data: { plan: 'premium', status: 'active' }, error: null },
    });
    adminMocks.getSupabaseAdmin.mockReset().mockReturnValue(client);

    const decision = await checkAiActionCredits({
      boardId: BOARD, userId: USER, role: AI_ROLE_CHAT, cost: 1, now: NOW,
      preferences: preferences('conn-1'), canReadBoard: canReadBoard(true),
    });

    expect(decision).toEqual({ kind: 'byok' });
    expect(aiFilters).toEqual([]);
  });

  it('allowByokFor is true only for a byok decision', () => {
    expect(allowByokFor({ kind: 'byok' })).toBe(true);
    expect(allowByokFor({ kind: 'forbidden' })).toBe(false);
    expect(allowByokFor({
      kind: 'allowed',
      plan: freePlan(),
      balance: aiCreditBalance(PLANS.free.limits, aiCreditPeriod(NOW, null), { allowanceUsed: 0, grantUsed: 0 }),
      charge: true,
    })).toBe(false);
    expect(allowByokFor({
      kind: 'refused',
      status: 402,
      body: { error: 'x', code: 'plan_limit_credits' },
    })).toBe(false);
  });

  it('managed without a board: plan_limit_no_board, and neither board nor ledger is read', async () => {
    adminMocks.getSupabaseAdmin.mockReset();
    const read = canReadBoard(true);

    const decision = await checkAiActionCredits({
      boardId: undefined, userId: USER, role: AI_ROLE_CHAT, cost: 1, now: NOW,
      preferences: preferences(null), canReadBoard: read,
    });

    expect(decision).toEqual({
      kind: 'refused',
      status: 402,
      body: {
        error: "This AI action isn't linked to a board, so it has no AI credits.",
        code: 'plan_limit_no_board',
      },
    });
    expect(read).not.toHaveBeenCalled();
    expect(adminMocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it('managed on a board the caller cannot read: forbidden, and no ledger read', async () => {
    adminMocks.getSupabaseAdmin.mockReset();

    const decision = await checkAiActionCredits({
      boardId: BOARD, userId: USER, role: AI_ROLE_CHAT, cost: 1, now: NOW,
      preferences: preferences(null), canReadBoard: canReadBoard(false),
    });

    expect(decision).toEqual({ kind: 'forbidden' });
    expect(adminMocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it('managed and readable: the PATCH-187 decision', async () => {
    // A paid plan: Free is 0 credits now, so an allowed decision needs one.
    const { client, aiFilters } = makeAdmin({
      subscription: { data: { plan: 'pro', status: 'active' }, error: null },
    });
    adminMocks.getSupabaseAdmin.mockReset().mockReturnValue(client);

    const decision = await checkAiActionCredits({
      boardId: BOARD, userId: USER, role: AI_ROLE_CHAT, cost: 1, now: NOW,
      preferences: preferences(null), canReadBoard: canReadBoard(true),
    });

    expect(decision.kind).toBe('allowed');
    if (decision.kind === 'allowed') expect(decision.charge).toBe(true);
    expect(aiFilters).toContainEqual(['workspace_id', WORKSPACE]);
  });

  it('a canReadBoard throw propagates', async () => {
    adminMocks.getSupabaseAdmin.mockReset();

    await expect(checkAiActionCredits({
      boardId: BOARD, userId: USER, role: AI_ROLE_CHAT, cost: 1, now: NOW,
      preferences: preferences(null),
      canReadBoard: async () => { throw new Error('down'); },
    })).rejects.toThrow('down');
  });
});

describe('PATCH-189 — the trial and the small Free plan', () => {
  const DAY = 24 * 60 * 60 * 1000;
  // `resolveBoardPlan` reads `created_at` against the REAL clock, so these are
  // relative to now, not to the fixed NOW the ledger arithmetic uses.
  const TRIAL_WORKSPACE = {
    data: { created_at: new Date(Date.now() - 2 * DAY).toISOString() },
    error: null,
  };
  const EXPIRED_WORKSPACE = {
    data: { created_at: new Date(Date.now() - 8 * DAY).toISOString() },
    error: null,
  };

  it('a trialing workspace allows up to 100 credits, then refuses', async () => {
    const under = makeAdmin({
      subscription: { data: null, error: null },
      workspace: TRIAL_WORKSPACE,
      allowance: { data: [{ credits: 99 }], error: null },
    });
    const allowed = await checkManagedAiCredits(under.client, BOARD, NOW, 1);
    expect(allowed.kind).toBe('allowed');
    if (allowed.kind === 'allowed') {
      expect(allowed.balance.allowance).toBe(100);
      expect(allowed.balance.remaining).toBe(1);
    }

    const spent = makeAdmin({
      subscription: { data: null, error: null },
      workspace: TRIAL_WORKSPACE,
      allowance: { data: [{ credits: 100 }], error: null },
    });
    const refused = await checkManagedAiCredits(spent.client, BOARD, NOW, 1);
    expect(refused.kind).toBe('refused');
    if (refused.kind === 'refused') expect(refused.body.code).toBe('plan_limit_credits');
  });

  it('an expired Free workspace refuses every managed call with plan_limit_credits', async () => {
    const { client } = makeAdmin({
      subscription: { data: null, error: null },
      workspace: EXPIRED_WORKSPACE,
    });

    const result = await checkManagedAiCredits(client, BOARD, NOW, 1);

    expect(result.kind).toBe('refused');
    if (result.kind === 'refused') expect(result.body.code).toBe('plan_limit_credits');
  });

  it('board chat on expired Free is refused, not free', async () => {
    const { client } = makeAdmin({
      subscription: { data: null, error: null },
      workspace: EXPIRED_WORKSPACE,
    });

    const result = await checkManagedAiCredits(client, BOARD, NOW, 1, { boardChat: true });

    expect(result.kind).toBe('refused');
    if (result.kind === 'refused') expect(result.body.code).toBe('plan_limit_credits');
  });
});
