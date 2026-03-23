---
name: Workspace Invitations System
description: Architecture and implementation of the workspace invitation link system, including the Members page UI, invite link generation, database schema, and the /invite/[code] redemption flow.
---

# Workspace Invitations System

## Overview

The invitation system allows workspace admins to invite users via **email** or **shareable links**. Invitations are stored in the `workspace_invitations` Supabase table and redeemed through the `/invite/[code]` page.

## Key Files

| File | Purpose |
|------|---------|
| `app/dashboard/settings/members/page.tsx` | Members page — UI for managing members, creating invite links, sending email invitations |
| `app/invite/[code]/page.tsx` | Invite redemption page — validates `link_code` and adds user to workspace |
| `supabase/migrations/20260311_create_workspace_invitations.sql` | Creates the `workspace_invitations` table |
| `supabase/migrations/20260309_normalize_workspace_roles.sql` | Adds `workspace_id` column, RLS policies, role constraints |
| `lib/workspace/context.ts` | `resolveCurrentWorkspace()`, role types, labels, descriptions |

## Database Schema

### `workspace_invitations` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | Auto-generated |
| `workspace_id` | uuid (FK → workspaces) | NOT NULL |
| `type` | text | `'link'` or `'email'` |
| `email` | text | For email invitations only |
| `role` | text | `'admin'`, `'member'`, or `'readonly'` |
| `link_code` | text (UNIQUE) | Random code for link invitations |
| `max_uses` | integer | Nullable — unlimited when null |
| `uses` | integer | Tracks redemption count |
| `email_domain` | text | Optional domain restriction |
| `created_by` | uuid (FK → users) | User who created the invitation |
| `redeemed_by` | uuid (FK → users) | User who redeemed (for single-use) |
| `redeemed_at` | timestamptz | When redeemed |
| `expires_at` | timestamptz | 7-day expiry by default |
| `created_at` | timestamptz | Auto |
| `updated_at` | timestamptz | Auto |

### RLS Policies

- **SELECT**: Workspace managers can view all; anyone can view active link invitations (by code, not expired, not maxed out)
- **INSERT/UPDATE/DELETE**: Only workspace managers (`can_manage_workspace()`)

## Members Page Architecture (`page.tsx`)

### Custom Components

- **`RoleDropdown`** — Custom radio-button dropdown for role selection. Uses `useRef` for click-outside detection (NOT `stopPropagation` — that breaks sibling button clicks). Accepts `name` prop for unique radio groups.

### Key State Variables

```
workspaceContext    — resolved via resolveCurrentWorkspace()
currentUser         — from supabase.auth.getUser()
pendingInvitations  — Invitation[] displayed in the table
showInviteLinkModal — controls "Create invite link" modal
showUpdateInvitationModal — controls "Update invitation" modal
showInviteUserModal — controls "Invite user" modal
```

### Key Functions

| Function | Purpose |
|----------|---------|
| `handleCreateInviteLink()` | Generates random invite code, saves to DB, updates UI |
| `handleInviteUser()` | Sends email invitations (comma-separated), saves to DB |
| `handleUpdateInvitation()` | Updates role/email_domain for existing invitation |
| `revokeInvitation()` | Deletes invitation from DB and state |
| `copyInvitationLink()` | Copies invite URL to clipboard |

### Important: Workspace Resolution

> [!CAUTION]
> `workspaceContext` and `currentUser` can be `null` on page load if the workspace resolution fails (e.g., tables not migrated, no auth session detected).
>
> All handler functions resolve the workspace **on-the-fly** using `resolveCurrentWorkspace()` if the initial context is null. DB operations are wrapped in `if (wsId)` blocks — never use early returns that block UI functionality.

## Invite Redemption Flow (`/invite/[code]`)

1. Page loads → calls `supabase.from('workspace_invitations').select('*').eq('link_code', code).single()`
2. Validates: not expired, not maxed out, email domain matches (if restricted)
3. If user is logged in: shows "Accept Invitation" button
4. If not logged in: redirects to `/login?redirect=/invite/{code}`
5. On accept: inserts into `workspace_members`, increments `uses` count

## Gotchas

- The `workspace_invitations` table must be created via migration before invitations work
- The `RoleDropdown` must NOT use `stopPropagation()` — it breaks sibling button click handlers
- Invite codes are generated client-side with `Math.random().toString(36)` — not cryptographically secure
- Email invitations don't actually send emails yet — they just record the intent in the database
