export type GlobalRole = "platform_admin" | "user";

export type WorkspaceRole = "owner" | "admin" | "member" | "readonly";

export type BoardPermission =
  | "admin"
  | "moderator"
  | "editor"
  | "commenter"
  | "reader";

export type BillingPlan = "free" | "pro";

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "free";

export interface WorkspaceMembershipContext {
  workspaceId: string;
  role: WorkspaceRole;
}

export interface BoardAccessContext {
  boardId: string;
  permission: BoardPermission;
}

export interface EntitlementsContext {
  plan: BillingPlan;
  status: SubscriptionStatus;
}

export interface AuthContext {
  identity: unknown;
  globalRole: GlobalRole;
  workspaceMembership?: WorkspaceMembershipContext;
  boardAccess?: BoardAccessContext;
  entitlements: EntitlementsContext;
}
