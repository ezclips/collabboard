import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import {
  aiCreditBalance,
  aiCreditPeriod,
  PLANS,
} from '../../domain/billing/plans';
import { AI_ROLE_CHAT } from '../../ai/aiRoles';
import {
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
});
const freePlan = (): BoardPlan => ({
  workspaceId: WORKSPACE,
  planId: 'free',
  limits: PLANS.free.limits,
  subscriptionPeriod: null,
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
        error: "This board isn't in a workspace, so it has no AI credits. Your own AI key still works here.",
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
    const balance = aiCreditBalance(PLANS.free.limits, period, { allowanceUsed: 9, grantUsed: 0 });

    await recordAiCreditUsage(client, {
      plan: freePlan(), balance, boardId: BOARD, userId: USER, feature: 'table_from_document', credits: 3,
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

  it('a caller on their own key never builds the admin client or reads the ledger', async () => {
    adminMocks.getSupabaseAdmin.mockReset();

    const decision = await checkBoardAiCredits({
      boardId: BOARD, userId: USER, role: AI_ROLE_CHAT, cost: 1, now: NOW,
      preferences: preferences('conn-1'),
    });

    expect(decision).toEqual({ kind: 'byok' });
    expect(adminMocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it('a managed caller reads the board owner ledger', async () => {
    const { client, aiFilters } = makeAdmin();
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
