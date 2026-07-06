# Permissions

The authorization model. This is currently the healthiest subsystem (`types/permissions.ts`, `lib/auth/permissions.ts`, RLS from migration 001) — this doc codifies it and closes the gaps.

## 1. Model — three levels, no more (P2, anti-Notion-complexity)

```
Workspace ──▶ Board ──▶ Share link
```

### Roles (as implemented in `types/permissions.ts` — keep)

| Level | Roles |
|---|---|
| Global | `platform_admin`, `user` |
| Workspace | `owner`, `admin`, `member`, `readonly` |
| Board | `admin`, `moderator`, `editor`, `commenter`, `reader` |

**Effective permission** = max(workspace-derived role, explicit board grant, share-link grant). Resolution lives in **one** function (`resolveBoardPermission(auth, board)`) — never inline role checks like `role === 'admin'` scattered in components.

### Capability matrix (the contract; enforce everywhere from this table)

| Capability | reader | commenter | editor | moderator | admin |
|---|---|---|---|---|---|
| View board | ✅ | ✅ | ✅ | ✅ | ✅ |
| React | — | ✅ | ✅ | ✅ | ✅ |
| Comment | — | ✅ | ✅ | ✅ | ✅ |
| Create/edit **own** posts | — | — | ✅ | ✅ | ✅ |
| Edit/delete **any** post, approve posts | — | — | — | ✅ | ✅ |
| Board settings, layout switch | — | — | — | — | ✅ |
| Share/membership management | — | — | — | — | ✅ |

Padlet-parity education features hang off this: `moderator` = teacher approval queue; "visitors can post anonymously" = share link with `editor` + anonymous identity.

## 2. Share Links

- Token in `share_links` row: `(token, board_id, permission, expires_at?, password_hash?, revoked_at)`.
- Tokens are unguessable (128-bit), **revocable individually** (Padlet gap: their regenerate kills all links), and carry the *lowest* permission needed.
- Anonymous visitors get a signed session cookie bound to the token → presence + attribution ("Anonymous Fox") without accounts.
- `/share/[token]` and `/invite/[code]` flows must both resolve through `resolveBoardPermission` — audit for parity in Phase 1.

## 3. Enforcement — defense in depth, three layers

1. **RLS (floor, non-negotiable):** every table has RLS; policies mirror the capability matrix. RLS protects against bugs in layers above; it is *not* the primary UX gate (too coarse for messages).
   - **Keep policies fast:** policies call one `security definer` helper (`can_access_board(board_id, min_permission)`) marked `stable`, so Postgres caches per-statement. Never repeat 4-way joins in every policy — this is also the fix for `postgres_changes` RLS overhead.
2. **Command layer (primary):** every command (`createPost`, `movePost`, …) asserts the required capability and returns a typed error the UI can render politely. This is where quota/entitlement checks (free vs pro, `EntitlementsContext`) also live.
3. **UI (cosmetic only):** hide/disable affordances by capability. Never the only check.

## 4. Known Gaps (close in Phase 1–2)

| Gap | Fix |
|---|---|
| Kanban has its own `board_members`/`permission_level` scheme (separate migrations) | Map to the board capability matrix now; schema merges in Phase 3 |
| Direct client writes (105 call sites) mean RLS is currently the *only* real check | Domain-layer extraction (ARCHITECTURE.md §4) makes layer 2 real |
| Realtime channels: verify board channels require authenticated membership (private channels), else read-permission users can be spoofed ops | Channel auth in Phase 2 transport change |
| Anonymous posting attribution/rate limits | Rate limit by token+IP (`lib/auth/rate-limit.ts` exists — extend) |
| `platform_admin` access paths | Must be audited + logged; admin reads go through an impersonation event, never silent |

## 5. Rules

- New table ⇒ RLS + policies in the same migration, or the migration is rejected.
- New capability ⇒ row added to the matrix in this doc *first*, then code.
- Permission checks are **deny-by-default**: unknown role/state resolves to no access.
- Entitlements (billing) and permissions (authz) stay separate concepts — a lapsed subscription reduces *quotas*, never *access to existing content* (P3).
