# PATCH-214 — Google Drive import uses Google's own Picker, with per-file access

Status: AUTHORIZED (owner, 2026-09-29: "You are the PM, I will follow your recommendation").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-213 (`126cb3a1`)

## Why
1. **Launch blocker.** We ask for `drive.readonly` (read the user's WHOLE Drive). Google classes it
   as *restricted*: the app is capped at 100 test users behind an "unverified app" warning until it
   passes a paid, yearly security assessment. Google's recommendation is the Google Picker plus
   `drive.file`, a *non-sensitive* scope: the user picks files, and the app gets access to those
   files only.
2. **A better browser for free.** The Picker brings Google's own search, Recent, Starred, Shared
   with me and Shared drives. Our browser lists only the first 100 items of a folder, and its search
   breaks on quotes.
3. **A silent dead connection (live, 2026-09-29).** `getValidAccessToken`
   (`lib/imports/tokenRefresh.ts` ~124-128) falls back to the EXPIRED access token when a refresh
   fails. Google then answers 401 and the list route says "Access token rejected. Please reconnect",
   while `/api/imports/status` still reports `connected: true`. Probable cause: Google gives
   refresh tokens of "Testing" apps a 7-day life. Whatever the cause, a refresh the provider refuses
   must read as "not connected".

## Package (authorized)
`@googleworkspace/drive-picker-react`, pinned EXACTLY at `0.2.0` (Apache-2.0, maintained by Google,
depends on `@googleworkspace/drive-picker-element@0.7.3`). No other new dependency. In the report,
list what the lockfile added.

## Design
1. **Scope** (`app/api/settings/integrations/oauth.ts`): Google `scope` becomes
   `openid email profile https://www.googleapis.com/auth/drive.file`. Keep `access_type: offline` and
   `prompt: consent`. REMOVE `include_granted_scopes: 'true'`, so a reconnect does not carry the old
   `drive.readonly` grant forward. Microsoft is unchanged.
2. **A refused refresh means not connected** (`lib/imports/tokenRefresh.ts`): when a refresh
   request returns HTTP 400 or 401 (the provider refused the refresh token, e.g. `invalid_grant`),
   `getValidAccessToken` returns `null` instead of the stale token. Network errors and 5xx keep
   today's fallback. For both providers. Do not change the database or the row. The routes already
   map `null` to 401 "Not connected".
3. **Status tells the truth** (`app/api/imports/status/route.ts`): `connected` is true only when the
   row exists AND `getValidAccessToken(userId, provider)` returns a token. Response shape unchanged.
4. **Picker token route**, new `app/api/imports/google-drive/picker-token/route.ts` (GET):
   - Auth as the other import routes do. No token → 401 `{ error: 'Not connected', reconnect: true }`.
   - Returns `{ accessToken, appId }` with `Cache-Control: no-store`.
   - `appId` is the Google Cloud project NUMBER: the leading digits of the Drive client id (the part
     before the first `-` in `GOOGLE_DRIVE_CLIENT_ID`, falling back to `GOOGLE_CLIENT_ID` as `oauth.ts`
     does). Put that derivation in a small pure helper `googleAppIdFromClientId(clientId)` in
     `lib/imports/googlePicker.ts` (new), returning `null` unless it is all digits; `null` → 500
     `{ error: 'Google Drive is not configured' }`.
   - Why the browser may hold this token: it is the user's own short-lived token for their own
     account, which is how the Picker works. Never log it.
5. **The Picker in the import dialog**: new `components/collabboard/imports/GoogleDrivePickerLauncher.tsx`.
   - Loads the React wrapper with `next/dynamic` and `ssr: false` (as its README shows).
   - On mount, fetches the picker token with the same auth-header helper `clientApi.ts` uses. Add a
     `getGooglePickerToken()` export to `clientApi.ts`. A 401 → `onReconnectRequired()`.
   - Renders `<DrivePicker appId oauthToken developerKey={process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY}
     multiselect={false} onPicked onCanceled>`, with ONE `<DrivePickerDocsView includeFolders="true"
     ownedByMe="default" />` (use the prop names the element's docs-view reference gives; check its
     README or type definitions in `node_modules`, and say which you used).
   - `onPicked`: take `detail.docs[0]` and call
     `resolveImportSelection({ provider: 'google-drive', itemId: doc.id, name: doc.name, mimeType: doc.mimeType }, signal)`.
     This is the PATCH-213 route, which re-resolves on the server. Honour `canResolveSelection` exactly
     as `ImportBrowser.tsx` does before resolving. On success, `onSelectItem(resolved)`. While
     resolving, show a small "Adding to the board…" state; on error, a short message with "Try again"
     (which reopens the picker) and "Close".
   - `onCanceled` → `onClose()`.
   - Missing `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY` → no picker, just a clear message: "Google Drive import
     is not set up yet (the Picker API key is missing)." plus a Close button.
6. **ImportsDialog** (`components/collabboard/imports/ImportsDialog.tsx`): on the `browser` screen,
   Google renders `GoogleDrivePickerLauncher` with the same callbacks `ImportBrowser` gets. OneDrive
   keeps `ImportBrowser` (PATCH-215 replaces it). While the Google Picker itself is open, do NOT render
   our dark overlay or our dialog box: Google's picker brings its own modal, and ours would sit on top
   of it (ours is `z-[4200]`). Render only the launcher's status UI (loading / resolving / error)
   inside our dialog when the picker is not showing.
7. **Picker above the canvas:** if Google's picker dialog (`.picker-dialog`, `.picker-dialog-bg`)
   renders below canvas chrome, add ONE global CSS rule raising those two classes to
   `z-index: 4300`, in the existing global stylesheet, with a comment. Say whether it was needed.
8. Leave `ImportBrowser.tsx`, the Google `list` / `search` / `thumbnail` routes and
   `lib/imports/googleDrive.ts` in place. Their removal is a later clean-up, once OneDrive has moved
   too. The `resolve` route PATCH-213 uses still needs `resolveGoogleDriveItem`, which works under
   `drive.file` for a picked file.

## Tests
- `googleAppIdFromClientId`: `'123456789012-abc.apps.googleusercontent.com'` → `'123456789012'`;
  `''`, `undefined`, `'abc-def'` → `null`.
- `tokenRefresh`: a refresh answered 400 `{ error: 'invalid_grant' }` → `null`; a network error
  → the old access token (today's fallback); a successful refresh → the new token (mock admin + fetch).
- `status` route: row present but `getValidAccessToken` null → `connected: false`.
- `picker-token` route: no auth → 401; not connected → 401 with `reconnect: true`; OK →
  `{ accessToken, appId }` and `Cache-Control: no-store`; a bad client id → 500.
- `oauth.ts`: the Google scope contains `drive.file` and NOT `drive.readonly`, and there is no
  `include_granted_scopes`.
- `GoogleDrivePickerLauncher` (mock the React wrapper and `clientApi`):
  - a pick calls `resolveImportSelection` with the doc id, then `onSelectItem`;
  - a cancel → `onClose`;
  - `canResolveSelection() === false` → no resolve;
  - a missing key → the message, and no picker;
  - a picker-token 401 → `onReconnectRequired`.
- `ImportsDialog`: Google → the launcher; OneDrive → `ImportBrowser`.
- If a test directory is not in `vitest.config.ts`'s `include`, add the narrowest pattern
  (authorized: `components/collabboard/imports/*.test.tsx`) with a `// PATCH-214` comment, and
  confirm the new files appear in the JSON run.
- **Mutations:** put `drive.readonly` back → the oauth test fails; return the stale token on 400 →
  the refresh test fails.

## Allowed files
```
package.json, package-lock.json                          (the one pinned dependency only)
app/api/settings/integrations/oauth.ts (+ test)
lib/imports/tokenRefresh.ts (+ test)
lib/imports/googlePicker.ts (+ test)                     (new)
lib/imports/clientApi.ts                                 (add getGooglePickerToken only)
app/api/imports/status/route.ts (+ test)
app/api/imports/google-drive/picker-token/route.ts (+ test)   (new)
components/collabboard/imports/GoogleDrivePickerLauncher.tsx (+ test)   (new)
components/collabboard/imports/ImportsDialog.tsx (+ test)
the global stylesheet (only the one z-index rule, if needed)
vitest.config.ts                                         (only the include pattern above)
```
Forbidden:
- the database, migrations, storage;
- `.env*` files: the CTO never sees or writes the key; the owner adds it;
- `ImportBrowser.tsx`, the OneDrive files, the PATCH-213 route's logic.
**Do not touch the comments inside `isBlockingEditorModalOpen`.** If a census or source test pins
any of these files, STOP and ask (spec line, code at file:line, proposed resolution).

Use `rg` or `timeout 30` for searches. Every test command is `timeout 600 npx vitest run …`. Delete
temporary diagnostic files (bash: `/dev/null`, never `nul`). No
stash/reset/restore/checkout/clean/commit/push; no production build. Real tool calls only. Never
print or log a token or key.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/imports app/api/imports app/api/settings components/collabboard/imports
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-214.json
```
The failing FILE set must equal the 26-file baseline, and every new test file must be present in the
JSON. Compact report, including the lockfile additions. Do not commit.

**Live (CTO, own tab, after the owner has added the key and reconnected):** Import post → Google Drive
→ Google's picker opens above the canvas → pick a PDF → the card appears with its preview, and
"open" goes to Drive. Cancel closes cleanly. Settings shows "Connected" only while the token works.

## Commit message (verbatim)
```
feat(imports): Google Drive import uses Google's Picker with per-file access

We asked for read access to the user's whole Drive, a restricted scope
that caps the app at 100 test users until it passes a paid yearly
security assessment. Import now opens Google's own Picker (search,
Recent, Starred, Shared drives) and asks only for drive.file, so the
app can read just the files the user picks. A refresh the provider
refuses now reads as "not connected" instead of handing out an expired
token behind a "Connected" label.
```

## Addendum (CTO, 2026-09-29): the package was dropped
Live, the board page failed to compile in `next dev`: "Package path . is not exported from package
@googleworkspace/drive-picker-react". The package is ESM-only, with only an `import` condition in
its `exports`. `transpilePackages` did not fix it. Decision: no npm package. `lib/imports/googlePickerClient.ts`
loads Google's official `https://apis.google.com/js/api.js` and builds the Picker, as Google's
web guide does. `package.json`, `package-lock.json` and `next.config.ts` are unchanged.

Review fixes, each with a regression test and a mutation:
- the launcher was rendered in two tree positions (a remount loop that refetched the token forever);
- "Try again" never refetched;
- new callback identities from a parent re-render closed and reopened the picker.

Live: with the owner's expired Google token, Import → Google Drive now shows "Google Drive is not
connected" (it used to show "Connected" while failing), with no page errors. The Picker itself is not yet
verified live: that needs the owner's API key and a reconnect.
