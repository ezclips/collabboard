import { describe, expect, it, vi } from "vitest";

import { PLANS, type AiCreditBalance, type PlanId } from "@/lib/domain/billing/plans";

import type { BoardPlan } from "./boardPlan";
import type { BillingActor } from "./stripeBilling";
import { createUsageHandler, type UsageHandlerDependencies } from "./usageRoute";

/**
 * PATCH-191. The usage route, with injected dependencies so no test reaches a
 * database. What is asserted: the ordering (auth -> workspace -> membership ->
 * reads), the refusal statuses, the exact response shape, and the two meter
 * arithmetic rules (used capped at total, and Free's zeroed credits).
 */

const WORKSPACE = "11111111-1111-4111-8111-111111111111";

const actor: BillingActor = {
  userId: "user-1",
  email: "member@example.com",
  supabase: {} as never,
  supabaseAdmin: {} as never,
};

function plan(planId: PlanId, over: Partial<BoardPlan> = {}): BoardPlan {
  return {
    workspaceId: WORKSPACE,
    planId,
    limits: PLANS[planId].limits,
    subscriptionPeriod: null,
    trial: null,
    ...over,
  };
}

function balance(over: Partial<AiCreditBalance> = {}): AiCreditBalance {
  return {
    allowance: 500,
    allowanceUsed: 7,
    grantTotal: 0,
    grantUsed: 0,
    remaining: 493,
    period: {
      start: new Date("2026-10-01T00:00:00Z"),
      end: new Date("2026-10-25T17:35:45.000Z"),
    },
    ...over,
  };
}

function deps(overrides: Partial<UsageHandlerDependencies> = {}): UsageHandlerDependencies {
  return {
    getAuthenticatedSession: vi.fn(async () => actor),
    resolveWorkspace: vi.fn(async () => ({ workspaceId: WORKSPACE })),
    workspaceRole: vi.fn(async () => "member"),
    resolveWorkspacePlan: vi.fn(async () => plan("pro")),
    readCredits: vi.fn(async () => balance()),
    countDocuments: vi.fn(async () => 38),
    countBoards: vi.fn(async () => 12),
    ...overrides,
  };
}

const request = () => new Request("http://localhost/api/billing/usage");

describe("GET /api/billing/usage", () => {
  it("401 without an actor, and a throw from auth is 401 too", async () => {
    const missing = createUsageHandler(deps({ getAuthenticatedSession: async () => null }));
    expect((await missing(request())).status).toBe(401);

    const thrown = createUsageHandler(deps({
      getAuthenticatedSession: async () => { throw new Error("down"); },
    }));
    expect((await thrown(request())).status).toBe(401);
  });

  it("400 with no active workspace", async () => {
    const handler = createUsageHandler(deps({ resolveWorkspace: async () => null }));
    const res = await handler(request());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "No active workspace" });
  });

  it("403 for a non-member", async () => {
    const handler = createUsageHandler(deps({ workspaceRole: async () => null }));
    const res = await handler(request());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("200 for a member who is not the owner", async () => {
    const handler = createUsageHandler(deps({ workspaceRole: async () => "member" }));
    expect((await handler(request())).status).toBe(200);
  });

  it("the exact Pro shape, with Cache-Control no-store", async () => {
    const res = await createUsageHandler(deps())(request());

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      planId: "pro",
      trialEndsAt: null,
      credits: { used: 7, total: 500, remaining: 493, renewsOn: "2026-10-25T17:35:45.000Z" },
      documents: { used: 38, limit: null },
      boards: { used: 12, limit: null },
    });
  });

  it("the trial shape: total 100 and trialEndsAt set", async () => {
    const trial = plan("premium", { trial: { endsAt: "2026-10-03T00:00:00.000Z" } });
    const handler = createUsageHandler(deps({
      resolveWorkspacePlan: async () => trial,
      readCredits: async () => balance({ allowance: 100, allowanceUsed: 7, remaining: 93 }),
    }));

    const body = await (await handler(request())).json();

    expect(body.planId).toBe("premium");
    expect(body.trialEndsAt).toBe("2026-10-03T00:00:00.000Z");
    expect(body.credits).toEqual({
      used: 7,
      total: 100,
      remaining: 93,
      renewsOn: "2026-10-25T17:35:45.000Z",
    });
  });

  it("Free after the trial: credits zeroed with no renewal, documents limit 0, boards limit 3", async () => {
    const handler = createUsageHandler(deps({
      resolveWorkspacePlan: async () => plan("free"),
      readCredits: async () => balance({ allowance: 0, allowanceUsed: 0, remaining: 0 }),
      countDocuments: async () => 38,
      countBoards: async () => 3,
    }));

    const body = await (await handler(request())).json();

    expect(body.credits).toEqual({ used: 0, total: 0, remaining: 0, renewsOn: null });
    expect(body.documents).toEqual({ used: 38, limit: 0 });
    expect(body.boards).toEqual({ used: 3, limit: 3 });
  });

  it("caps used at total when the workspace is overspent", async () => {
    const handler = createUsageHandler(deps({
      readCredits: async () => balance({
        allowance: 500,
        allowanceUsed: 612,
        remaining: 0,
      }),
    }));

    const body = await (await handler(request())).json();

    expect(body.credits.used).toBe(500);
    expect(body.credits.total).toBe(500);
    expect(body.credits.remaining).toBe(0);
  });

  it("a read that throws is 503", async () => {
    const handler = createUsageHandler(deps({
      resolveWorkspacePlan: async () => { throw new Error("db down"); },
    }));
    const res = await handler(request());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Usage is unavailable right now." });
  });

  it("a membership-read throw is 503, not a denial", async () => {
    const handler = createUsageHandler(deps({
      workspaceRole: async () => { throw new Error("rpc down"); },
    }));
    expect((await handler(request())).status).toBe(503);
  });
});
