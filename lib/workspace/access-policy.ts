import type { BoardPermission } from '@/types/permissions';

export type PrivacyOptionKey =
  | 'requirePassword'
  | 'requireLogin'
  | 'publishToProfileAndWeb'
  | 'showInWorkspaceDashboard';

export type VisitorPermission = BoardPermission | 'no_access';

export interface WorkspaceAccessPolicy {
  requirePassword: boolean;
  password: string;
  requireLogin: boolean;
  publishToProfileAndWeb: boolean;
  showInWorkspaceDashboard: boolean;
  visitorPermission: VisitorPermission;
}

export interface CanvasAccessSettings {
  accessPolicy: WorkspaceAccessPolicy;
}

export interface BoardAccessMetadata {
  accessPolicy: WorkspaceAccessPolicy;
  showInWorkspaceDashboard: boolean;
}

export interface CanvasAccessGateResult {
  accessPolicy: WorkspaceAccessPolicy;
  visitorPermission: BoardPermission | null;
}

export const privacyOptionDefinitions: Array<{
  key: PrivacyOptionKey;
  label: string;
  description: string;
}> = [
  {
    key: 'requirePassword',
    label: 'Require password',
    description: 'People need the link and a password before they can open the board.',
  },
  {
    key: 'requireLogin',
    label: 'Require visitors to log in',
    description: 'Anonymous access is blocked and activity is tied to signed-in identities.',
  },
  {
    key: 'publishToProfileAndWeb',
    label: 'Publish to profile and web',
    description: 'Make the board discoverable from profile surfaces and public web entry points.',
  },
  {
    key: 'showInWorkspaceDashboard',
    label: 'Show in workspace dashboard',
    description: 'Expose the board inside the shared workspace dashboard for internal discovery.',
  },
];

export const visitorPermissionDefinitions: Array<{
  key: VisitorPermission;
  label: string;
  description: string;
}> = [
  {
    key: 'no_access',
    label: 'No access',
    description: 'Only the owner and explicitly added collaborators can open the board.',
  },
  {
    key: 'reader',
    label: 'Reader',
    description: 'Visitors can open the board and read existing content.',
  },
  {
    key: 'commenter',
    label: 'Commenter',
    description: 'Visitors can react and comment, but they cannot create or edit board content.',
  },
  {
    key: 'editor',
    label: 'Writer / Editor',
    description: 'Visitors can create content, read, and comment. This maps to the board editor role.',
  },
  {
    key: 'moderator',
    label: 'Moderator',
    description: 'Visitors can read, write, comment, and moderate or approve submitted content.',
  },
  {
    key: 'admin',
    label: 'Admin',
    description: 'Visitors can manage the board itself, including invites and board-level settings.',
  },
];

export function createDefaultWorkspaceAccessPolicy(): WorkspaceAccessPolicy {
  return {
    requirePassword: false,
    password: '',
    requireLogin: false,
    publishToProfileAndWeb: false,
    showInWorkspaceDashboard: true,
    visitorPermission: 'reader',
  };
}

export function normalizeWorkspaceAccessPolicy(value: unknown): WorkspaceAccessPolicy {
  const defaults = createDefaultWorkspaceAccessPolicy();

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return defaults;
  }

  const candidate = value as Partial<Record<keyof WorkspaceAccessPolicy, unknown>>;
  const visitorPermission = candidate.visitorPermission;
  const isKnownVisitorPermission = visitorPermissionDefinitions.some(
    ({ key }) => key === visitorPermission,
  );

  return {
    requirePassword: candidate.requirePassword === true,
    password: typeof candidate.password === 'string' ? candidate.password : '',
    requireLogin: candidate.requireLogin === true,
    publishToProfileAndWeb: candidate.publishToProfileAndWeb === true,
    showInWorkspaceDashboard:
      typeof candidate.showInWorkspaceDashboard === 'boolean'
        ? candidate.showInWorkspaceDashboard
        : defaults.showInWorkspaceDashboard,
    visitorPermission: isKnownVisitorPermission
      ? (visitorPermission as VisitorPermission)
      : defaults.visitorPermission,
  };
}

export function summarizePrivacyOptions(policy: WorkspaceAccessPolicy): string[] {
  const selected: string[] = [];

  if (policy.requirePassword) {
    selected.push('Password required');
  }
  if (policy.requireLogin) {
    selected.push('Login required');
  }
  if (policy.publishToProfileAndWeb) {
    selected.push('Published to profile and web');
  }
  if (policy.showInWorkspaceDashboard) {
    selected.push('Visible in workspace dashboard');
  }

  return selected;
}

export function buildCanvasAccessSettings(policy: WorkspaceAccessPolicy): CanvasAccessSettings {
  return {
    accessPolicy: {
      ...policy,
      password: policy.requirePassword ? policy.password.trim() : '',
    },
  };
}

export function isCanvasPublicFromPolicy(policy: WorkspaceAccessPolicy): boolean {
  return policy.publishToProfileAndWeb;
}

export function buildBoardAccessMetadata(policy: WorkspaceAccessPolicy): BoardAccessMetadata {
  return {
    accessPolicy: {
      ...policy,
      password: policy.requirePassword ? policy.password.trim() : '',
    },
    showInWorkspaceDashboard: policy.showInWorkspaceDashboard,
  };
}

export function getCanvasAccessPolicy(settings: unknown): WorkspaceAccessPolicy {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return createDefaultWorkspaceAccessPolicy();
  }

  const candidate = settings as { accessPolicy?: unknown };
  return normalizeWorkspaceAccessPolicy(candidate.accessPolicy);
}

export function getVisitorBoardPermission(policy: WorkspaceAccessPolicy): BoardPermission | null {
  return policy.visitorPermission === 'no_access' ? null : policy.visitorPermission;
}

export function resolveCanvasAccessGate(settings: unknown): CanvasAccessGateResult {
  const accessPolicy = getCanvasAccessPolicy(settings);

  return {
    accessPolicy,
    visitorPermission: getVisitorBoardPermission(accessPolicy),
  };
}