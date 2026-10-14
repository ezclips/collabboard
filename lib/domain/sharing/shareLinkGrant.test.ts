import { describe, expect, it } from 'vitest';

import {
  kanbanPermissionForRole,
  kanbanPermissionSatisfies,
  shareLinkRole,
  shouldUpgradeCollaborator,
  type KanbanPermission,
  type ShareLinkRole,
} from './shareLinkGrant';

const ROLE_RANK: Record<ShareLinkRole, number> = { viewer: 1, commenter: 2, editor: 3 };
const KANBAN_RANK: Record<KanbanPermission, number> = { view: 1, comment: 2, edit: 3, admin: 4 };

describe('PATCH-357 shareLinkRole', () => {
  it('maps each legacy permission to its board role', () => {
    expect(shareLinkRole('edit')).toBe('editor');
    expect(shareLinkRole('comment')).toBe('commenter');
    expect(shareLinkRole('view')).toBe('viewer');
  });

  it('grants nothing for an unknown or missing permission', () => {
    expect(shareLinkRole('admin')).toBeNull();
    expect(shareLinkRole('')).toBeNull();
    expect(shareLinkRole('EDIT')).toBeNull();
    expect(shareLinkRole(null)).toBeNull();
    expect(shareLinkRole(undefined)).toBeNull();
  });
});

describe('PATCH-357 shouldUpgradeCollaborator', () => {
  it('writes when there is no existing role', () => {
    expect(shouldUpgradeCollaborator(null, 'viewer')).toBe(true);
    expect(shouldUpgradeCollaborator(undefined, 'editor')).toBe(true);
  });

  it('upgrades to a strictly higher role', () => {
    expect(shouldUpgradeCollaborator('viewer', 'commenter')).toBe(true);
    expect(shouldUpgradeCollaborator('viewer', 'editor')).toBe(true);
    expect(shouldUpgradeCollaborator('commenter', 'editor')).toBe(true);
  });

  it('never downgrades: equal or lower roles are left alone', () => {
    const roles: ShareLinkRole[] = ['viewer', 'commenter', 'editor'];
    for (const existing of roles) {
      for (const next of roles) {
        const expected = ROLE_RANK[next] > ROLE_RANK[existing];
        expect(shouldUpgradeCollaborator(existing, next), `${existing} -> ${next}`).toBe(expected);
      }
    }
  });

  it('replaces an unknown existing role with a known one', () => {
    expect(shouldUpgradeCollaborator('owner', 'viewer')).toBe(true);
    expect(shouldUpgradeCollaborator('banana', 'commenter')).toBe(true);
    expect(shouldUpgradeCollaborator('', 'viewer')).toBe(true);
  });
});

describe('PATCH-360 kanbanPermissionForRole', () => {
  it('maps each board role to its Kanban permission', () => {
    expect(kanbanPermissionForRole('editor')).toBe('edit');
    expect(kanbanPermissionForRole('commenter')).toBe('comment');
    expect(kanbanPermissionForRole('viewer')).toBe('view');
  });
});

describe('PATCH-360 kanbanPermissionSatisfies', () => {
  it('a missing or unknown existing permission satisfies nothing', () => {
    expect(kanbanPermissionSatisfies(null, 'view')).toBe(false);
    expect(kanbanPermissionSatisfies(undefined, 'view')).toBe(false);
    expect(kanbanPermissionSatisfies('banana', 'view')).toBe(false);
  });

  it('satisfies when the existing rank is at least the wanted rank', () => {
    const ranks: KanbanPermission[] = ['view', 'comment', 'edit', 'admin'];
    for (const existing of ranks) {
      for (const wanted of ranks) {
        const expected = KANBAN_RANK[existing] >= KANBAN_RANK[wanted];
        expect(kanbanPermissionSatisfies(existing, wanted), `${existing} >= ${wanted}`).toBe(expected);
      }
    }
  });
});
