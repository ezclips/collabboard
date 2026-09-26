import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  effectivePlanId,
  planIncludes,
  planLimits,
  workspacePlan,
  PLANS,
  type PlanId,
} from "@/lib/domain/billing/plans";
import { resolveCurrentWorkspace } from "@/lib/workspace/context";
import type {
  AuthContext,
  BoardPermission,
  EntitlementsContext,
  GlobalRole,
  SubscriptionStatus,
  WorkspaceRole,
} from "@/types/permissions";

export type LegacyBoardPermission = "view" | "comment" | "edit" | "admin";

const boardPermissionRank: Record<BoardPermission, number> = {
  reader: 1,
  commenter: 2,
  editor: 3,
  moderator: 4,
  admin: 5,
};

const legacyBoardPermissionRank: Record<LegacyBoardPermission, number> = {
  view: 1,
  comment: 2,
  edit: 3,
  admin: 5,
};

export const FREE_PLAN_BOARD_LIMIT = PLANS.free.limits.boards;

export function mapLegacyToBoardPermission(
  permission: string | null | undefined,
): BoardPermission | null {
  switch (permission) {
    case "view":
      return "reader";
    case "comment":
      return "commenter";
    case "edit":
      return "editor";
    case "admin":
      return "admin";
    case "reader":
    case "commenter":
    case "editor":
    case "moderator":
      return permission;
    default:
      return null;
  }
}

export function mapBoardPermissionToLegacy(
  permission: BoardPermission | null | undefined,
): LegacyBoardPermission | null {
  switch (permission) {
    case "reader":
      return "view";
    case "commenter":
      return "comment";
    case "editor":
      return "edit";
    case "moderator":
    case "admin":
      return "admin";
    default:
      return null;
  }
}

function normalizeSubscriptionStatus(status: string | null | undefined): SubscriptionStatus {
  switch (status) {
    case "active":
    case "trialing":
    case "past_due":
    case "canceled":
      return status;
    default:
      return "free";
  }
}

export async function getGlobalRole(
  supabase: SupabaseClient,
  userId: string,
): Promise<GlobalRole> {
  const { data, error } = await supabase.rpc("is_platform_admin", {
    user_uuid: userId,
  });

  if (error) {
    return "user";
  }

  return data ? "platform_admin" : "user";
}

/**
 * PATCH-189. The plan that applies to an entitlements context. During the
 * 7-day Premium trial the subscription row grants nothing (`status` is 'free'),
 * so `effectivePlanId` alone would read Free; a non-null `trialEndsAt` is the
 * trial, which is Premium-level.
 */
function effectiveEntitlementPlan(entitlements: EntitlementsContext): PlanId {
  if (entitlements.trialEndsAt !== null) return "premium";
  return effectivePlanId(entitlements.plan, entitlements.status);
}

/**
 * PATCH-189. Reads the workspace's `created_at` through the SAME client it is
 * given. RLS allows it: the `workspaces` SELECT policy is
 * "Users can view workspaces they belong to" (`USING has_workspace_access(id)`,
 * migration 20260309_normalize_workspace_roles.sql), whose `get_workspace_role`
 * sees the caller's own `workspace_members` row -- so every member can read
 * their workspace's creation time, not just the owner.
 */
export async function getWorkspaceEntitlements(
  supabase: SupabaseClient,
  workspaceId: string | null | undefined,
): Promise<EntitlementsContext> {
  if (!workspaceId) {
    return { plan: "free", status: "free", trialEndsAt: null };
  }

  const [{ data: subscription }, { data: workspace }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("plan, status")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    supabase
      .from("workspaces")
      .select("created_at")
      .eq("id", workspaceId)
      .maybeSingle(),
  ]);

  const subscriptionRow = subscription as {
    plan?: string | null;
    status?: string | null;
  } | null;
  const createdAt =
    (workspace as { created_at?: string | null } | null)?.created_at ?? null;

  const resolved = workspacePlan(subscriptionRow, createdAt, new Date());

  return {
    plan: resolved.planId,
    status: normalizeSubscriptionStatus(subscriptionRow?.status),
    trialEndsAt: resolved.trial ? resolved.trial.endsAt.toISOString() : null,
  };
}

export function hasProEntitlements(entitlements: EntitlementsContext): boolean {
  return planIncludes(effectiveEntitlementPlan(entitlements), "pro");
}

export function hasPremiumEntitlements(entitlements: EntitlementsContext): boolean {
  return planIncludes(effectiveEntitlementPlan(entitlements), "premium");
}

export function getBoardLimitForEntitlements(
  entitlements: EntitlementsContext,
): number | "unlimited" {
  const limits = planLimits(effectiveEntitlementPlan(entitlements));
  return limits.boards === null ? "unlimited" : limits.boards;
}

export function canCreateBoardForEntitlements(
  entitlements: EntitlementsContext,
  currentBoardCount: number,
): boolean {
  const limit = getBoardLimitForEntitlements(entitlements);
  return limit === "unlimited" || currentBoardCount < limit;
}

export async function getBoardPermission(
  supabase: SupabaseClient,
  boardId: string,
  userId: string,
): Promise<BoardPermission | null> {
  const { data, error } = await supabase.rpc("get_board_permission", {
    board_uuid: boardId,
    user_uuid: userId,
  });

  if (error) {
    throw error;
  }

  return mapLegacyToBoardPermission(data) ?? (data as BoardPermission | null);
}

export function boardPermissionSatisfies(
  permission: BoardPermission | null | undefined,
  required: BoardPermission,
): boolean {
  if (!permission) return false;
  return boardPermissionRank[permission] >= boardPermissionRank[required];
}

export function legacyBoardPermissionSatisfies(
  permission: LegacyBoardPermission | null | undefined,
  required: LegacyBoardPermission,
): boolean {
  if (!permission) return false;
  return legacyBoardPermissionRank[permission] >= legacyBoardPermissionRank[required];
}

export async function requireBoardPermission(
  supabase: SupabaseClient,
  boardId: string,
  userId: string,
  required: BoardPermission,
) {
  const permission = await getBoardPermission(supabase, boardId, userId);

  return {
    permission,
    allowed: boardPermissionSatisfies(permission, required),
    legacyPermission: mapBoardPermissionToLegacy(permission),
  };
}

export async function getPermissionContext(
  supabase: SupabaseClient,
  user: Pick<User, "id" | "email">,
  workspaceId?: string,
  boardId?: string,
): Promise<AuthContext> {
  const globalRole = await getGlobalRole(supabase, user.id);

  const workspaceContext = workspaceId
    ? await (async () => {
        const { data, error } = await supabase.rpc("get_workspace_role", {
          workspace_uuid: workspaceId,
          user_uuid: user.id,
        });

        if (error || !data) return null;
        return {
          workspaceId,
          role: data as WorkspaceRole,
        };
      })()
    : await resolveCurrentWorkspace(supabase, user);

  const entitlements = await getWorkspaceEntitlements(
    supabase,
    workspaceContext?.workspaceId,
  );

  const boardPermission = boardId
    ? await getBoardPermission(supabase, boardId, user.id)
    : null;

  return {
    identity: user,
    globalRole,
    workspaceMembership: workspaceContext
      ? {
          workspaceId: workspaceContext.workspaceId,
          role: workspaceContext.role as WorkspaceRole,
        }
      : undefined,
    boardAccess: boardId && boardPermission
      ? {
          boardId,
          permission: boardPermission,
        }
      : undefined,
    entitlements,
  };
}
