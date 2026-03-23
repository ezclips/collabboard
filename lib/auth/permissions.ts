import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveCurrentWorkspace } from "@/lib/workspace/context";
import type {
  AuthContext,
  BillingPlan,
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

export const FREE_PLAN_BOARD_LIMIT = 3;

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

export async function getWorkspaceEntitlements(
  supabase: SupabaseClient,
  workspaceId: string | null | undefined,
): Promise<EntitlementsContext> {
  if (!workspaceId) {
    return { plan: "free", status: "free" };
  }

  const { data } = await supabase
    .from("subscriptions")
    .select("plan, status")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  return {
    plan: ((data?.plan as BillingPlan | undefined) ?? "free"),
    status: normalizeSubscriptionStatus(data?.status),
  };
}

export function hasProEntitlements(entitlements: EntitlementsContext): boolean {
  return (
    entitlements.plan === "pro" &&
    ["active", "trialing", "past_due"].includes(entitlements.status)
  );
}

export function getBoardLimitForEntitlements(
  entitlements: EntitlementsContext,
): number | "unlimited" {
  return hasProEntitlements(entitlements) ? "unlimited" : FREE_PLAN_BOARD_LIMIT;
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
