# PATCH-214b — Connecting checks that Drive access was actually granted

Status: AUTHORIZED (owner, 2026-09-29: "yes please").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-214 (`139e7763`)

## Why (found live, 2026-09-29)
The owner reconnected Google Drive after PATCH-214, and Settings showed "Connected". Google's
consent screen lists each permission with its own checkbox, and the Drive box was not ticked. The
stored token carried only `openid email profile` (checked with Google's tokeninfo), so the Picker
answered **403** with no explanation. After a reconnect with the box ticked, the token had
`drive.file` and the Picker worked. Any live user can untick that box, and Microsoft's consent can
grant fewer scopes too.

`app/api/settings/integrations/callback/handler.ts` already parses the granted scopes
(`tokenJson.scope`, ~128-131) and stores them in `user_integrations.scopes`, but never checks them.

## Design
1. **Pure helper** in `app/api/settings/integrations/oauth.ts`:
   `missingRequiredScopes(provider: IntegrationProvider, granted: readonly string[]): string[]`.
   - Required scopes:
     - Google: `https://www.googleapis.com/auth/drive.file`.
     - Microsoft: `Files.Read`. Microsoft may return it bare (`Files.Read`) or prefixed
       (`https://graph.microsoft.com/Files.Read`); both count, compared case-insensitively.
   - Returns the required scopes that are missing (an empty array means OK).
   - **An empty `granted` array means "the provider did not say", so it returns `[]`** (do not
     block: some token responses omit `scope`). Only a NON-empty list that lacks a required scope
     is a failure.
   - Export a constant `REQUIRED_SCOPES` so the list lives in one place next to each provider's
     `scope` string.
2. **The callback refuses a connection without Drive access.** In `handleOAuthCallback`, after the
   token exchange and BEFORE the upsert:
   - if `missingRequiredScopes(provider.id, scopes)` is non-empty, do NOT upsert. Redirect with
     `status=error` and a message the user can act on:
     - Google: `Google Drive access wasn't granted. Click Connect again and tick the box "See, edit, create, and delete only the specific Google Drive files you use with this app".`
     - Microsoft: `OneDrive access wasn't granted. Click Connect again and accept the request to read your files.`
   - Keep the order of everything else: state check, token exchange, profile, upsert.
   - Do not revoke the token and do not delete an existing row. The old connection, if any, stays as
     it was.
3. **The error is visible long enough to read.** The Settings page shows the callback's `message`
   with `toast.error` (`app/dashboard/settings/integrations/page.tsx` ~64-74). Give this toast a
   duration of about 12 s, if the toast library allows a per-call option (check its type). Do not
   change the page otherwise.

## Tests
- `missingRequiredScopes`:
  - Google with `drive.file` → `[]`;
  - Google with only `openid email profile` → `[drive.file]`;
  - Google with `[]` → `[]`;
  - Microsoft with `Files.Read` or `https://graph.microsoft.com/Files.Read` (any case) → `[]`;
  - Microsoft with only `User.Read openid` → `['Files.Read']`.
- Callback (a new `callback/handler.test.ts`; mock `fetch` for the token and profile, the admin
  client, `encryptToken`, and pass a valid state from `createOAuthState`):
  - a token with `scope` lacking `drive.file` → a redirect to `/dashboard/settings/integrations`
    with `status=error` and the Google message, and **no upsert**;
  - `scope` with `drive.file` → an upsert and `status=success`;
  - no `scope` field → an upsert and success.
- If `app/api/settings/integrations/callback/*.test.ts` is not already matched by the vitest
  include (PATCH-214 added `app/api/settings/**/*.test.ts`), confirm it is picked up.
- **Mutation:** skip the check → the "no upsert" test fails.

## Allowed files
```
app/api/settings/integrations/oauth.ts (+ oauth.test.ts)
app/api/settings/integrations/callback/handler.ts (+ new handler.test.ts)
app/dashboard/settings/integrations/page.tsx   (only the toast duration for the callback error)
```
Forbidden:
- the database, migrations, `package.json`, `next.config.ts`, `.env*`;
- the imports routes and components.

If a census or source test pins these files, STOP and ask (spec line, code at file:line,
proposed resolution).

Use `rg` or `timeout 30` for searches. Every test command is `timeout 600 npx vitest run …`. Delete
temporary diagnostic files (bash: `/dev/null`, never `nul`); do NOT run `ls` on the repo root. No
stash/reset/restore/checkout/clean/commit/push; no production build. Real tool calls only. Never
print or log a token.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run app/api/settings lib/imports app/api/imports components/collabboard/imports
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-214b.json
```
The failing FILE set must equal the 26-file baseline, and the new test file must be present. Compact
report. Do not commit. Do NOT curl the dev server (the CTO does the live checks).

## Commit message (verbatim)
```
fix(integrations): connecting checks that Drive access was granted

Google's consent screen gives each permission its own checkbox. When
the Drive box was left unticked, the connection was saved and shown as
"Connected", but the token could not open Drive and Google's Picker
answered 403 with no explanation. The callback now checks the granted
scopes and, if Drive (or OneDrive Files.Read) is missing, saves nothing
and tells the user to connect again and tick the box.
```
