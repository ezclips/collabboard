# Kanban Phase 2 Patterns (#9 and #12)

This document defines the default behavior for Phase 2 features (comments and votes) so implementation is consistent across write paths and UI states.

## #9 Error Handling Patterns

### Write operation contract
- Every adapter write returns a structured result: `ok`, `message`, plus typed flags where relevant (`isDuplicate`, `conflict`, `authExpired`, `networkError`).
- Callers do not infer from console logs; they branch on the returned result.

### Error classification
- `validation`:
  - Example: duplicate link or invalid payload.
  - Behavior: do not retry; show inline error near the control and toast only when action is not in a focused form.
- `conflict`:
  - Example: optimistic lock mismatch (`updated_at` changed).
  - Behavior: toast + board refetch (`handleConflict(...)`), no local retry.
- `auth expired`:
  - Behavior: toast "Session expired. Please sign in again."; stop write flow; no retry loop.
- `network / Supabase outage`:
  - Behavior: toast with failure reason; rollback optimistic local change; no background queue.
- `unknown`:
  - Behavior: generic toast and rollback optimistic local change.

### Retry policy
- Mutations: no automatic retry for now.
- Reads: allow manual retry via explicit user action (button) where applicable.
- Future queue/offline sync is out of scope for Phase 2.

### Rollback/refetch policy
- If a mutation used optimistic local update and fails with non-`ok`, rollback that local change.
- For `conflict`, prefer authoritative refetch instead of handcrafted rollback.

## #12 Loading/Empty/Error UI State Patterns

### Loading states
- Comments/votes load independently from card shell.
- Show section-level loading indicator (`Loading comments...`, `Loading votes...`).
- Disable section submit buttons while initial load or pending write is in flight.

### Empty states
- Comments empty: `No comments yet. Start the discussion.`
- Votes empty/zero: `No votes yet.`
- Empty states are rendered inside the section body (not via global toast).

### Error states
- Write failures: toast error using the classification rules above.
- Input-specific failures (validation) also show inline message near the input.
- Read failures: show compact inline error with a retry action.

### UX consistency rules
- One primary feedback channel per failure path:
  - focused form validation: inline first, toast optional.
  - background/system error: toast first.
- Keep labels and wording stable across comments and votes.

## Scope

These patterns are mandatory for:
- `kanban_comments` CRUD flows
- `kanban_votes` CRUD flows

These patterns do not cover:
- real-time merge UX beyond current conflict toast + refetch
- offline queueing
