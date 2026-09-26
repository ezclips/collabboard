import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { PLANS, PLAN_TRIAL_DAYS } from "@/lib/domain/billing/plans";

import { countWorkspaceKnowledgeDocuments, resolveBoardPlan } from "./boardPlan";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * PATCH-185. The board-owner's plan and the document count, with an injected
 * client so no test reaches a real database.
 */

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const BOARD = "22222222-2222-4222-8222-222222222222";

function makeAdminClient(handlers: {
  board?: { data: unknown; error: unknown };
  subscription?: { data: unknown; error: unknown };
  /** PATCH-189. The workspace's `created_at`, read to decide the trial. */
  workspace?: { data: unknown; error: unknown };
  boardIds?: { data: unknown; error: unknown };
  documentCount?: { count: number | null; error: unknown };
}) {
  const calls = {
    boardEq: [] as unknown[][],
    boardListEq: [] as unknown[][],
    subscriptionEq: [] as unknown[][],
    workspaceEq: [] as unknown[][],
    in: [] as unknown[][],
    neq: [] as unknown[][],
  };

  const from = vi.fn((table: string) => {
    if (table === "boards") {
      return {
        select: vi.fn((columns: string) => {
          if (columns === "id") {
            return {
              eq: vi.fn((column: string, value: unknown) => {
                calls.boardListEq.push([column, value]);
                return Promise.resolve(handlers.boardIds ?? { data: [], error: null });
              }),
            };
          }
          const builder = {
            eq: vi.fn((column: string, value: unknown) => {
              calls.boardEq.push([column, value]);
              return builder;
            }),
            maybeSingle: vi.fn(async () => handlers.board ?? { data: null, error: null }),
          };
          return builder;
        }),
      };
    }

    if (table === "subscriptions") {
      const builder = {
        eq: vi.fn((column: string, value: unknown) => {
          calls.subscriptionEq.push([column, value]);
          return builder;
        }),
        maybeSingle: vi.fn(async () => handlers.subscription ?? { data: null, error: null }),
      };
      return { select: vi.fn(() => builder) };
    }

    if (table === "workspaces") {
      const builder = {
        eq: vi.fn((column: string, value: unknown) => {
          calls.workspaceEq.push([column, value]);
          return builder;
        }),
        // PATCH-189 default: no `created_at`, so no trial. Every pre-PATCH-189
        // case here keeps its old meaning.
        maybeSingle: vi.fn(async () => handlers.workspace ?? { data: { created_at: null }, error: null }),
      };
      return { select: vi.fn(() => builder) };
    }

    if (table === "knowledge_documents") {
      const builder = {
        in: vi.fn((column: string, value: unknown) => {
          calls.in.push([column, value]);
          return builder;
        }),
        neq: vi.fn((column: string, value: unknown) => {
          calls.neq.push([column, value]);
          return Promise.resolve(handlers.documentCount ?? { count: 0, error: null });
        }),
      };
      return { select: vi.fn(() => builder) };
    }

    throw new Error(`unexpected table: ${table}`);
  });

  return { client: { from } as unknown as SupabaseClient, calls };
}

describe("resolveBoardPlan", () => {
  it("a board in a workspace with pro active → pro limits", async () => {
    const { client } = makeAdminClient({
      board: { data: { workspace_id: WORKSPACE }, error: null },
      subscription: { data: { plan: "pro", status: "active" }, error: null },
    });

    const plan = await resolveBoardPlan(client, BOARD);

    expect(plan.workspaceId).toBe(WORKSPACE);
    expect(plan.planId).toBe("pro");
    expect(plan.limits).toBe(PLANS.pro.limits);
  });

  it("premium past_due grants premium", async () => {
    const { client } = makeAdminClient({
      board: { data: { workspace_id: WORKSPACE }, error: null },
      subscription: { data: { plan: "premium", status: "past_due" }, error: null },
    });

    const plan = await resolveBoardPlan(client, BOARD);

    expect(plan.planId).toBe("premium");
    expect(plan.limits).toBe(PLANS.premium.limits);
  });

  it("pro canceled → free", async () => {
    const { client } = makeAdminClient({
      board: { data: { workspace_id: WORKSPACE }, error: null },
      subscription: { data: { plan: "pro", status: "canceled" }, error: null },
    });

    const plan = await resolveBoardPlan(client, BOARD);

    expect(plan.planId).toBe("free");
    expect(plan.limits).toBe(PLANS.free.limits);
  });

  it("no subscription row → free", async () => {
    const { client } = makeAdminClient({
      board: { data: { workspace_id: WORKSPACE }, error: null },
      subscription: { data: null, error: null },
    });

    const plan = await resolveBoardPlan(client, BOARD);

    expect(plan).toEqual({
      workspaceId: WORKSPACE,
      planId: "free",
      limits: PLANS.free.limits,
      subscriptionPeriod: null,
      trial: null,
    });
  });

  it("a board without a workspace → free with workspaceId null", async () => {
    const { client, calls } = makeAdminClient({
      board: { data: { workspace_id: null }, error: null },
    });

    const plan = await resolveBoardPlan(client, BOARD);

    expect(plan).toEqual({
      workspaceId: null,
      planId: "free",
      limits: PLANS.free.limits,
      subscriptionPeriod: null,
      trial: null,
    });
    // No workspace means nothing to look a subscription up under.
    expect(calls.subscriptionEq).toEqual([]);
    expect(calls.workspaceEq).toEqual([]);
  });

  it("a boards read error throws (fail closed)", async () => {
    const { client } = makeAdminClient({
      board: { data: null, error: { code: "42703", message: "boom" } },
    });

    await expect(resolveBoardPlan(client, BOARD)).rejects.toEqual({
      code: "42703",
      message: "boom",
    });
  });

  it("a subscriptions read error throws (fail closed)", async () => {
    const { client } = makeAdminClient({
      board: { data: { workspace_id: WORKSPACE }, error: null },
      subscription: { data: null, error: { code: "42501", message: "denied" } },
    });

    await expect(resolveBoardPlan(client, BOARD)).rejects.toEqual({
      code: "42501",
      message: "denied",
    });
  });

  it("PATCH-187: an active Pro carries its subscription period", async () => {
    const { client } = makeAdminClient({
      board: { data: { workspace_id: WORKSPACE }, error: null },
      subscription: {
        data: {
          plan: "pro",
          status: "active",
          current_period_start: "2026-09-01T00:00:00Z",
          current_period_end: "2026-10-01T00:00:00Z",
        },
        error: null,
      },
    });

    const plan = await resolveBoardPlan(client, BOARD);

    expect(plan.subscriptionPeriod).toEqual({
      start: "2026-09-01T00:00:00Z",
      end: "2026-10-01T00:00:00Z",
    });
  });

  it("PATCH-187: Free carries no subscription period, even with stored dates", async () => {
    const { client } = makeAdminClient({
      board: { data: { workspace_id: WORKSPACE }, error: null },
      subscription: {
        data: {
          plan: "pro",
          status: "canceled",
          current_period_start: "2026-09-01T00:00:00Z",
          current_period_end: "2026-10-01T00:00:00Z",
        },
        error: null,
      },
    });

    const plan = await resolveBoardPlan(client, BOARD);

    expect(plan.planId).toBe("free");
    expect(plan.subscriptionPeriod).toBeNull();
  });

  it("PATCH-187: no subscription row carries no subscription period", async () => {
    const { client } = makeAdminClient({
      board: { data: { workspace_id: WORKSPACE }, error: null },
      subscription: { data: null, error: null },
    });

    const plan = await resolveBoardPlan(client, BOARD);

    expect(plan.subscriptionPeriod).toBeNull();
  });
});

describe("resolveBoardPlan PATCH-189: the 7-day Premium trial", () => {
  const createdAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();
  const trialEndFor = (createdAt: string) =>
    new Date(Date.parse(createdAt) + PLAN_TRIAL_DAYS * DAY_MS).toISOString();

  it("a board created 2 days ago is on the Premium trial, with the trial window as its credit period", async () => {
    const createdAt = createdAgo(2);
    const { client, calls } = makeAdminClient({
      board: { data: { workspace_id: WORKSPACE }, error: null },
      subscription: { data: null, error: null },
      workspace: { data: { created_at: createdAt }, error: null },
    });

    const plan = await resolveBoardPlan(client, BOARD);

    expect(plan.planId).toBe("premium");
    expect(plan.trial).toEqual({ endsAt: trialEndFor(createdAt) });
    expect(plan.subscriptionPeriod).toEqual({
      start: new Date(createdAt).toISOString(),
      end: trialEndFor(createdAt),
    });
    // The workspace row is read BY ID, with the same client.
    expect(calls.workspaceEq).toEqual([["id", WORKSPACE]]);
  });

  it("a board created 8 days ago is Free", async () => {
    const { client } = makeAdminClient({
      board: { data: { workspace_id: WORKSPACE }, error: null },
      subscription: { data: null, error: null },
      workspace: { data: { created_at: createdAgo(8) }, error: null },
    });

    const plan = await resolveBoardPlan(client, BOARD);

    expect(plan.planId).toBe("free");
    expect(plan.trial).toBeNull();
    expect(plan.subscriptionPeriod).toBeNull();
  });

  it("a workspaces read error throws (fail closed)", async () => {
    const { client } = makeAdminClient({
      board: { data: { workspace_id: WORKSPACE }, error: null },
      subscription: { data: null, error: null },
      workspace: { data: null, error: { code: "42501", message: "denied" } },
    });

    await expect(resolveBoardPlan(client, BOARD)).rejects.toEqual({
      code: "42501",
      message: "denied",
    });
  });
});

describe("countWorkspaceKnowledgeDocuments", () => {
  it("counts the workspace's documents and excludes failed ones", async () => {
    const { client, calls } = makeAdminClient({
      boardIds: { data: [{ id: "board-1" }, { id: "board-2" }], error: null },
      documentCount: { count: 3, error: null },
    });

    const count = await countWorkspaceKnowledgeDocuments(client, WORKSPACE);

    expect(count).toBe(3);
    expect(calls.boardListEq).toEqual([["workspace_id", WORKSPACE]]);
    expect(calls.in).toEqual([["board_id", ["board-1", "board-2"]]]);
    expect(calls.neq).toEqual([["processing_status", "failed"]]);
  });

  it("is 0 when the workspace has no boards", async () => {
    const { client } = makeAdminClient({
      boardIds: { data: [], error: null },
    });

    expect(await countWorkspaceKnowledgeDocuments(client, WORKSPACE)).toBe(0);
  });

  it("a read error throws (fail closed)", async () => {
    const { client } = makeAdminClient({
      boardIds: { data: [{ id: "board-1" }], error: null },
      documentCount: { count: null, error: { code: "57014", message: "timeout" } },
    });

    await expect(countWorkspaceKnowledgeDocuments(client, WORKSPACE)).rejects.toEqual({
      code: "57014",
      message: "timeout",
    });
  });
});
