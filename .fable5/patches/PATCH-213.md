# PATCH-213 — The import route fetches only what the provider says, and previews are unguessable

Status: AUTHORIZED (owner, 2026-09-29: "You are the PM, I will follow your recommendation").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-212 (`b7feeb37`)
Followed by: PATCH-214 (Google Picker + `drive.file`), PATCH-215 (OneDrive picker v8), PATCH-216 (imported
PDFs/Docs into the wiki and AI).

## What the CTO found (security, HIGH)
`app/api/imports/resolve-selection/route.ts`:
1. **SSRF + token leak.** The route fetches `body.thumbnailUrl`, a URL the CLIENT sends, from the
   server (~81-94). It attaches the user's Google access token when the URL merely *contains*
   `googleusercontent.com` or `googleapis.com` (a substring test). So
   `https://evil.example/?googleapis.com` receives the token, and any URL (internal addresses
   included) is fetched and its body stored.
2. **Private previews at guessable public URLs.** Previews go to the `import-previews` bucket at
   `imports/{userId}/{provider}/{itemId}.png` with `getPublicUrl`. Someone who knows a user id and a
   Drive file id can view the preview of a private file.
3. `body.openUrl`, `name` and `mimeType` are also trusted from the client and stored on the card.

`app/api/imports/google-drive/thumbnail/route.ts` allows every `*.googleapis.com` host with the
bearer token attached. `storage.googleapis.com` serves anyone's public buckets, so the token can go
to a third party.

## Design
1. **The server resolves the item itself.** In `resolve-selection`, after auth:
   - Validate `provider` (one of the two) and `itemId` with a strict pattern: Google
     `^[A-Za-z0-9_-]{10,200}$`; OneDrive `^[A-Za-z0-9!_.-]{1,200}$`. Anything else → 400.
   - Get the user's token (`getValidAccessToken`); none → 401 `{ error: 'Not connected' }`.
   - Call `resolveGoogleDriveItem` / `resolveOneDriveItem` with that token. `null` → 404
     `{ error: 'File not found' }`. A folder → 400.
   - From then on, use ONLY the resolved item: `name`, `mimeType`, `sizeBytes`, `openUrl`, and the
     thumbnail. Google: the thumbnail is `rawThumbnailUrl` (never the proxy URL). OneDrive:
     `thumbnailUrl`. The body's `thumbnailUrl`, `openUrl`, `name`, `mimeType` and `sizeBytes` are
     ignored. The client may keep sending them, so do not change `clientApi.ts` or `ImportBrowser.tsx`.
2. **A strict fetch allowlist.** A new pure helper `lib/imports/providerUrls.ts`:
   - `isAllowedThumbnailUrl(provider, url): boolean`. It parses with `new URL`; `https:` only; the
     hostname must match EXACTLY or be a true subdomain (`host === h || host.endsWith('.' + h)`).
     - Google: `googleusercontent.com`, `drive.google.com`, `www.googleapis.com` (exact host only,
       not every `*.googleapis.com`).
     - OneDrive: `1drv.com`, `livefilestore.com`, `sharepoint.com`, `onedrive.live.com`,
       `graph.microsoft.com`.
   - `shouldAttachGoogleToken(url): boolean`. True only for a Google allowlisted host.
   - The route fetches a thumbnail only if allowed, attaches the Google token only when
     `shouldAttachGoogleToken`, and uses `redirect: 'error'`, so a redirect cannot carry the token or
     the fetch elsewhere. A thumbnail that is not allowed → skip to the generated preview card (Case 3).
   - `google-drive/thumbnail/route.ts` uses the same helper, with `redirect: 'error'`.
3. **Unguessable preview paths.** `uploadToStorage` writes to
   `imports/{userId}/{provider}/{crypto.randomUUID()}.{ext}` with `upsert: false`. Use `png` for the
   generated card, and the extension from the thumbnail's content type (`jpeg` → `jpg`, `png`,
   `webp`, `gif`; anything else → `png`). The bucket stays as it is: it now matches how board images
   in `padlet-files` work (a public bucket, random names). Do not change the bucket or its
   policies.
4. Keep the three cases (image thumbnail, document thumbnail, generated card) and the response
   shape `ResolvedImportItem` unchanged. `openUrl` now comes from the provider, falling back to `''`.
5. Error bodies stay short and never include tokens or upstream bodies. Replace the existing
   `console.error('Storage upload failed:', …)` only if needed. Do not add new logging.

## Tests
- `lib/imports/providerUrls.test.ts`:
  - `https://lh3.googleusercontent.com/x` allowed for Google;
  - `https://evil.example/?googleapis.com`, `https://googleusercontent.com.evil.example/`,
    `http://lh3.googleusercontent.com/x`, `https://storage.googleapis.com/b/o`, and
    `https://169.254.169.254/` all refused;
  - a `*.files.1drv.com` URL allowed for OneDrive but refused for Google;
  - `shouldAttachGoogleToken` false for every non-Google host.
- `app/api/imports/resolve-selection/route.test.ts` (new; mock auth, `getValidAccessToken`, the
  provider resolvers, `fetch`, the Supabase admin storage and `generatePreviewPng`):
  - The body's `thumbnailUrl: 'https://evil.example/?googleapis.com'` is never fetched. The fetched
    URL is the resolver's `rawThumbnailUrl`.
  - The Authorization header is never sent to a non-Google host.
  - The response `name` / `openUrl` / `mimeType` come from the resolver, not the body.
  - Resolver `null` → 404, and nothing is uploaded.
  - A bad `itemId` (`../x`, `a/b`) → 400, and the resolver is not called.
  - The upload path matches `^imports/<uid>/google-drive/[0-9a-f-]{36}\.(png|jpg|webp|gif)$` and
    does NOT contain the item id; `upsert` is false.
  - A disallowed thumbnail from the resolver → a generated card (Case 3), with no fetch.
- **Mutations:**
  - revert to `url.includes('googleapis.com')` → the evil-host test fails;
  - put `itemId` back in the path → the path test fails.

## Allowed files
```
app/api/imports/resolve-selection/route.ts (+ new route.test.ts)
app/api/imports/google-drive/thumbnail/route.ts
lib/imports/providerUrls.ts (+ test)                    (new)
```
Forbidden:
- the database, storage bucket settings, migrations, `package.json`;
- `clientApi.ts`, `ImportBrowser.tsx`, the OAuth files;
- `lib/imports/googleDrive.ts` and `oneDrive.ts` (use them as they are).

If a census or source test pins the route's body, STOP and ask (spec line, code at file:line,
proposed resolution).

Use `rg` or `timeout 30` for searches. Every test command is `timeout 600 npx vitest run …`. Delete
temporary diagnostic files (bash: `/dev/null`, never `nul`). No
stash/reset/restore/checkout/clean/commit/push; no production build. Real tool calls only. Never
print or log a token.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/imports app/api/imports
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-213.json
```
The failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

**Live (CTO, own tab):** import one Google Drive file through "Import post". The card appears with
its preview, the preview URL has a random name, and "open" goes to Drive. A crafted
`resolve-selection` POST with an outside `thumbnailUrl` gets a card whose preview came from the
provider, not from that URL.

## Commit message (verbatim)
```
fix(imports): resolve a picked file on the server; previews get random names

The import route fetched a thumbnail URL sent by the browser and added
the user's Google token whenever that URL merely contained
"googleapis.com", so a crafted request could fetch any address and send
the token to it. The server now looks the file up with the provider
itself, fetches only the thumbnail the provider returns, from an exact
host allowlist, without following redirects. Previews were stored under
the Drive/OneDrive file id at a public URL; they now get a random name.
```
