import { describe, expect, it, vi } from 'vitest';

import { PLANS, aiCreditBalance, type AiCreditBalance } from '@/lib/domain/billing/plans';

import { createBoardCreditsHandler, type BoardCreditsHandlerDependencies } from './boardCreditsRoute';
import type { BoardPlan } from './boardPlan';

/**
 * PATCH-343. The Board AI credits read edge, with injected deps: the ordering
 * (auth -> readability -> plan -> balance -> own-key) is what these tests pin.
 * A board the caller cannot read must never reveal the owner's plan or balance.
 */

const BOARD = 'board-1';
const USER = 'user-1';

const period = { start: new Date('2026-10-01T00:00:00Z'), end: new Date('2026-10-25T17:35:45Z') };

function plan(planId: BoardPlan['planId']): BoardPlan {
  return {
    workspaceId: 'ws-1',
    planId,
    limits: PLANS[planId].limits,
    subscriptionPeriod: null,
    trial: null,
  };
}

function balance(): AiCreditBalance {
  return aiCreditBalance(PLANS.pro.limits, period, { allowanceUsed: 500, grantUsed: 0 });
}

function makeHandler(over: Partial<BoardCreditsHandlerDependencies> = {}) {
  const deps: BoardCreditsHandlerDependencies = {
    getUserId: vi.fn(async () => USER),
    canReadBoard: vi.fn(async () => true),
    resolvePlan: vi.fn(async () => plan('pro')),
    readBalance: vi.fn(async () => balance()),
    resolveOwnKey: vi.fn(async () => false),
    ...over,
  };
  return { handler: createBoardCreditsHandler(deps), deps };
}

const get = (handler: ReturnType<typeof createBoardCreditsHandler>, boardId = BOARD) =>
  handler(new Request(`http://localhost/api/boards/${boardId}/ai/credits`), {
    params: Promise.resolve({ id: boardId }),
  });

describe('PATCH-343 board credits route', () => {
  it('401 without a session, and nothing else is read', async () => {
    const { handler, deps } = makeHandler({ getUserId: vi.fn(async () => null) });
    expect((await get(handler)).status).toBe(401);
    expect(deps.canReadBoard).not.toHaveBeenCalled();
    expect(deps.resolvePlan).not.toHaveBeenCalled();
  });

  it('403 when the board is not readable, and plan/balance are never read', async () => {
    const { handler, deps } = makeHandler({ canReadBoard: vi.fn(async () => false) });
    expect((await get(handler)).status).toBe(403);
    expect(deps.resolvePlan).not.toHaveBeenCalled();
    expect(deps.readBalance).not.toHaveBeenCalled();
    expect(deps.resolveOwnKey).not.toHaveBeenCalled();
  });

  it('free reports zeros with no renewal and reads no balance', async () => {
    const { handler, deps } = makeHandler({ resolvePlan: vi.fn(async () => plan('free')) });
    const response = await get(handler);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.planId).toBe('free');
    expect(body.credits).toEqual({ used: 0, total: 0, remaining: 0, renewsOn: null });
    expect(deps.readBalance).not.toHaveBeenCalled();
  });

  it('pro meters the balance, and ownKey is false', async () => {
    const b = balance();
    const { handler } = makeHandler({ resolveOwnKey: vi.fn(async () => false) });
    const body = await (await get(handler)).json();
    expect(body.planId).toBe('pro');
    expect(body.credits).toEqual({
      used: b.allowanceUsed + b.grantUsed,
      total: b.allowance + b.grantTotal,
      remaining: b.remaining,
      renewsOn: period.end.toISOString(),
    });
    expect(body.ownKey).toBe(false);
    expect((await get(handler)).headers.get('Cache-Control')).toBe('no-store');
  });

  it('premium + byok resolves ownKey true; premium + default is false', async () => {
    const byok = makeHandler({ resolvePlan: vi.fn(async () => plan('premium')), resolveOwnKey: vi.fn(async () => true) });
    expect((await (await get(byok.handler)).json()).ownKey).toBe(true);

    const def = makeHandler({ resolvePlan: vi.fn(async () => plan('premium')), resolveOwnKey: vi.fn(async () => false) });
    expect((await (await get(def.handler)).json()).ownKey).toBe(false);
  });

  it('503 when a plan, balance or preference read throws', async () => {
    const planThrow = makeHandler({ resolvePlan: vi.fn(async () => { throw new Error('db'); }) });
    expect((await get(planThrow.handler)).status).toBe(503);

    const balanceThrow = makeHandler({ readBalance: vi.fn(async () => { throw new Error('db'); }) });
    expect((await get(balanceThrow.handler)).status).toBe(503);

    const ownKeyThrow = makeHandler({ resolveOwnKey: vi.fn(async () => { throw new Error('pref'); }) });
    expect((await get(ownKeyThrow.handler)).status).toBe(503);
  });
});
