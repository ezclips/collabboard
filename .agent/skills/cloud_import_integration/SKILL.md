---
name: Cloud Import Integration (Google Drive & Microsoft OneDrive)
description: Architecture, file layout, OAuth flow, token refresh logic, and bug fixes for the Google Drive and Microsoft OneDrive import browser feature.
---

# Cloud Import Integration -- Google Drive & Microsoft OneDrive

## Overview

Users can browse and import files from Google Drive and Microsoft OneDrive directly inside the app via an `ImportBrowser` modal. Both providers share a unified `ImportBrowserItem` type and common UI components. The integration uses OAuth2 tokens stored in Supabase and refreshes them server-side before calling provider APIs.

---

## Key Files

| File | Purpose |
|------|---------|
| `lib/imports/types.ts` | Shared `ImportBrowserItem` type |
| `lib/imports/googleDrive.ts` | Google Drive API helpers (list, search, resolve) |
| `lib/imports/oneDrive.ts` | Microsoft Graph API helpers (list, search, resolve) |
| `lib/imports/tokenRefresh.ts` | OAuth token validation and proactive refresh |
| `lib/imports/auth.ts` | `getAuthenticatedUserId()` -- reads session from request |
| `app/api/imports/google-drive/list/route.ts` | `GET /api/imports/google-drive/list?parentId=root` |
| `app/api/imports/google-drive/search/route.ts` | `GET /api/imports/google-drive/search?q=...` |
| `app/api/imports/microsoft-onedrive/list/route.ts` | `GET /api/imports/microsoft-onedrive/list?parentId=root` |
| `app/api/imports/microsoft-onedrive/search/route.ts` | `GET /api/imports/microsoft-onedrive/search?q=...` |
| `app/api/settings/integrations/oauth.ts` | Provider configs, OAuth state sign/verify |
| `app/api/settings/integrations/connect/route.ts` | Initiates OAuth flow, builds authUrl |
| `app/api/settings/integrations/callback/handler.ts` | Handles OAuth callback, exchanges code for tokens, upserts to Supabase |
| `app/api/settings/integrations/callback/[provider]/route.ts` | Re-exports GET from handler |
| `components/collabboard/imports/ImportBrowser.tsx` | Main modal UI (folder nav, search, file list, select) |
| `components/collabboard/imports/ImportGrid.tsx` | Grid of file/folder tiles with thumbnails |
| `components/collabboard/imports/ImportsDialog.tsx` | Dialog shell with provider chooser and screen state |
| `components/collabboard/imports/ConnectionRequiredDialog.tsx` | Modal shown when provider is not connected |

---

## Architecture

### ImportBrowserItem (shared shape)

```typescript
interface ImportBrowserItem {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
  isFolder: boolean;
  thumbnailUrl?: string;       // proxy URL for client-side <img src> display
  rawThumbnailUrl?: string;    // original provider URL for server-side fetching
  iconUrl?: string;
  openUrl?: string;
  provider: 'google-drive' | 'microsoft-onedrive';
  parentId?: string;
  path?: string[];
}
```

Both `googleDrive.ts` and `oneDrive.ts` normalise their provider-specific API responses into this shape.

**IMPORTANT — two thumbnail URL fields for Google Drive:**
- `thumbnailUrl` = `/api/imports/google-drive/thumbnail?url=...` (proxy URL, safe for `<img src>` in the browser)
- `rawThumbnailUrl` = raw `lh3.googleusercontent.com` URL (needed for server-side fetch with auth header)

When passing a thumbnail to `resolve-selection`, always use `rawThumbnailUrl ?? thumbnailUrl` — NOT `thumbnailUrl` alone. The server cannot fetch a relative proxy URL.

### Token Refresh Flow (`tokenRefresh.ts`)

1. Look up row in `user_integrations` by `(userId, provider)`.
2. If `expires_at` is in the future (60s buffer): return stored `access_token` directly.
3. If `expires_at` is null AND a `refresh_token` exists: **proactively refresh** -- the token came from an old OAuth grant that did not record an expiry.
4. If `expires_at` is past: refresh using stored `refresh_token`.
5. If refresh fails: fall back to stored access token and let the provider API decide -- better to attempt than to return null immediately.
6. If no refresh token and token is not expired: return it and let the route convert a 401/403 into a reconnect response.

### Route Error Handling

All four API routes use the same pattern:

```typescript
if (/:\s*(401|403)/.test(message)) {
  return NextResponse.json(
    { error: 'Access token rejected. Please reconnect ...', reconnect: true },
    { status: 401 }
  );
}
return NextResponse.json({ error: message }, { status: 502 });
```

### ImportBrowser 401 Escalation

When any list or search API returns 401, `ImportBrowser` calls `onReconnectRequired?.()` instead of showing an inline error. This bubbles up to `ImportsDialog` which switches to the `connection-required` screen, showing `ConnectionRequiredDialog`.

```typescript
if (res.status === 401) {
  if (onReconnectRequired) {
    onReconnectRequired();
  } else {
    setError('reconnect');
  }
  return;
}
```

### Status Check (`/api/imports/status`)

Uses `getSupabaseAdmin()` (service role) after JWT validation -- NOT `makeAuthedClient`. This avoids RLS edge cases where `auth.uid()` may not resolve correctly in this route context. Auth is still validated at the application level via the user's JWT before the admin client is used.

---

## OAuth Provider Config (`oauth.ts`)

Both providers are declared in `getProviders()`:

- **Google Drive** -- scopes: `openid email profile https://www.googleapis.com/auth/drive.readonly`. Extra params: `access_type=offline`, `prompt=consent`.
- **Microsoft OneDrive** -- scopes: `openid profile email offline_access Files.Read User.Read`. Tenant: `MICROSOFT_TENANT_ID` env var (defaults to `common`).

OAuth state is HMAC-SHA256 signed with `OAUTH_STATE_SECRET` (falls back to `SUPABASE_SERVICE_ROLE_KEY`). State expires after 15 minutes.

---

## Environment Variables

```env
GOOGLE_DRIVE_CLIENT_ID
GOOGLE_DRIVE_CLIENT_SECRET
MICROSOFT_CLIENT_ID          # The Application (client) ID from Azure App Registration Overview -- NOT the secret keyId
MICROSOFT_CLIENT_SECRET      # The secret VALUE (text), not the keyId
MICROSOFT_TENANT_ID          # Optional -- defaults to "common" (supports personal + org accounts)
OAUTH_STATE_SECRET           # HMAC key for OAuth state; falls back to SUPABASE_SERVICE_ROLE_KEY
```

### CRITICAL: MICROSOFT_CLIENT_ID vs keyId confusion

The Azure portal shows two GUIDs that look similar:
- **Application (client) ID** -- on the Overview page -- this is `MICROSOFT_CLIENT_ID`
- **keyId** -- shown in the Credentials section and manifest `passwordCredentials[].keyId` -- this is NOT the client ID

Setting `MICROSOFT_CLIENT_ID` to the keyId produces `unauthorized_client: The client does not exist or is not enabled for consumers` because Microsoft cannot find an app with that ID.

**Always copy `MICROSOFT_CLIENT_ID` from the Overview page `appId` field, not from the credentials/secrets section.**

---

## Azure App Registration Requirements

For personal Microsoft accounts (hotmail.com, outlook.com, live.com) to work:

| Setting | Required Value |
|---------|---------------|
| Supported account types (UI) | "Accounts in any organizational directory and personal Microsoft accounts" |
| `signInAudience` (manifest) | `AzureADandPersonalMicrosoftAccount` |
| `api.requestedAccessTokenVersion` (manifest) | `2` |
| Redirect URI platform | Web |
| Redirect URI | `http://localhost:3000/api/settings/integrations/callback/microsoft-onedrive` |
| Authority in code | `https://login.microsoftonline.com/common/oauth2/v2.0/authorize` |

### Azure portal Save button quirk

When the supported account types is already set to the correct value, the Save button appears grayed out. Workaround:
1. Select a different account type (e.g. "Nur ein Mandant") and Save
2. Then select "Alle Konten von Entra ID-Mandanten und persönliche Microsoft-Konten" and Save again

### Redirect URI fragment error

Azure will reject saves with "Fragments are not supported in redirect URIs" if any registered URI contains a `#` character. This can happen if a browser navigation URL (e.g. `https://portal.azure.com/#blade/...`) is accidentally pasted into the redirect URI field. Delete any URI containing `#` before saving.

---

## Bugs Fixed During Implementation

### 1. Google Drive 502 -- expired token not refreshed (`expires_at = null`)

**Problem:** First-time OAuth grant stored `access_token` but `expires_at` was null. `isExpired(null)` returned `false` so the token was used without refreshing. Google rejected it with 401.

**Fix:** Added "unknown expiry" path in `tokenRefresh.ts`:

```typescript
const unknownExpiry = data.expires_at === null;
if (!isExpired(data.expires_at) && accessToken && !(unknownExpiry && refreshToken)) {
  return accessToken;
}
```

---

### 2. Microsoft OneDrive 400 -- invalid `$orderby` query parameter

**Problem:** List URL included `$orderby=folder%20desc,name`. Microsoft Graph does not support `$orderby` on drive children endpoints.

**Fix:** Removed `$orderby` from the list URL entirely.

---

### 3. Microsoft OneDrive -- invalid `$expand=thumbnails(select=...)` syntax

**Problem:** `$expand=thumbnails(select=large,medium)` is not valid syntax for thumbnail resources in Microsoft Graph.

**Fix:** Reverted to plain `$expand=thumbnails`. The `normalise()` function reads `large` first, falling back to `medium`.

---

### 4. Reconnect state showed empty grid instead of prompt

**Problem:** `ImportBrowser` stored `'reconnect'` as the error string but the render block silently showed an empty grid.

**Fix:** Added explicit `error === 'reconnect'` branch before generic error branch in the render tree.

---

### 11. Google Drive image imports show document icon instead of image on canvas

**Problem:** After selecting a Google Drive image and clicking "Select", the canvas card showed a generic document icon instead of the actual image.

**Root cause:** `boostThumbnail()` in `googleDrive.ts` wraps the raw Google URL in a proxy path: `/api/imports/google-drive/thumbnail?url=...`. This proxy URL was stored in `ImportBrowserItem.thumbnailUrl` and then passed directly to `POST /api/imports/resolve-selection`. Inside that route, `fetch(thumbnailUrl)` was called server-side — a **relative URL**, which throws on the server. The error was silently caught, resolution fell through to Case 3 (branded preview card), and the canvas showed a document icon.

**Fix (four files):**

1. `lib/imports/types.ts` — Added `rawThumbnailUrl?: string` alongside `thumbnailUrl` to `ImportBrowserItem`.

2. `lib/imports/googleDrive.ts` — `boostThumbnail()` now returns `{ raw, proxy }`. `normalise()` stores `thumbnailUrl = proxy` (for `<img src>` display) and `rawThumbnailUrl = raw` (for server-side fetch).

3. `components/collabboard/imports/ImportBrowser.tsx` — `handleSelect` sends `rawThumbnailUrl ?? thumbnailUrl` to `resolve-selection`, not `thumbnailUrl` alone.

4. `app/api/imports/resolve-selection/route.ts` — Added `fetchThumbnail()` helper that attaches `Authorization: Bearer <googleToken>` when the URL is a Google domain. Imports `getValidAccessToken` to obtain the token.

**Guardrail:** Never pass `thumbnailUrl` (proxy URL) to `resolve-selection`. Always use `rawThumbnailUrl ?? thumbnailUrl` so the server receives the real provider URL.

---

### 5. Google Drive thumbnails blurry + not loading

**Problem 1:** Default thumbnail URLs end with `=s220` which is too small for retina grid tiles.

**Problem 2:** Google Drive `thumbnailLink` URLs require an `Authorization: Bearer <token>` header. Browsers cannot attach auth headers to `<img src>` requests, so thumbnails silently fail to load (OneDrive thumbnails work because they are pre-signed CDN URLs requiring no auth).

**Fix:** Two-part solution:

1. Proxy route `app/api/imports/google-drive/thumbnail/route.ts` fetches the thumbnail server-side with the Google access token and streams the image back. Only proxies `lh3.googleusercontent.com` / `drive.google.com` / `googleapis.com` hostnames.

2. `ItemThumbnail` in `ImportGrid.tsx` uses `fetch()` with the Supabase Bearer token (passed down from `ImportBrowser` via `accessToken` prop) to call the proxy, converts the response to a blob URL, and uses that as the `<img src>`. The fetch only starts when the tile is visible (IntersectionObserver with `rootMargin: '300px'`) to avoid loading all thumbnails at once.

3. `boostThumbnail(url, mimeType)` in `googleDrive.ts` picks the size based on file type -- documents (PDF, Word, Google Docs/Sheets/Slides, etc.) get `=s1200` for readable text; images and other files get `=s800`:

```typescript
const size = DOCUMENT_MIME_TYPES.has(mimeType) ? 's1200' : 's800';
const boosted = url.replace(/=s\d+$/, `=${size}`);
return `/api/imports/google-drive/thumbnail?url=${encodeURIComponent(boosted)}`;
```

**Guardrails:**
- Do NOT render Google Drive thumbnail URLs directly in `<img src>` -- they require auth and will silently 403.
- Always proxy through `/api/imports/google-drive/thumbnail?url=...` and fetch with `Authorization: Bearer <supabaseToken>` from the client.
- `ImportGrid` must receive `accessToken` prop from `ImportBrowser` for Google Drive thumbnails to load.
- Use `IntersectionObserver` with `rootMargin: '300px'` to lazy-load -- do NOT fetch all thumbnails on mount.

---

### 6. OneDrive thumbnails -- prefer `large` over `medium`

**Problem:** `normalise()` only read `medium` thumbnail URL.

**Fix:** Updated to prefer `large`:

```typescript
thumbnailUrl: item.thumbnails?.[0]?.large?.url ?? item.thumbnails?.[0]?.medium?.url,
```

---

### 7. Thumbnail gray boxes in ImportGrid

**Problem:** `onError` handler on `<img>` only called `style.display = 'none'`, leaving a gray empty container with no fallback icon.

**Fix:** React `useState` flag `imgError` -- when true, renders `<FileIcon>` fallback instead:

```tsx
function ItemThumbnail({ item }: { item: ImportBrowserItem }) {
  const [imgError, setImgError] = useState(false);
  if (item.thumbnailUrl && !imgError) {
    return (
      <img
        src={item.thumbnailUrl}
        alt={item.name}
        className="w-full h-full object-cover"
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-50">
      <FileIcon item={item} />
    </div>
  );
}
```

---

### 8. Token refresh failure returning null causing 401

**Problem:** When `refreshToken` call failed, the code returned `null` immediately, which caused the API route to return 401 even when a (possibly still-valid) access token was available.

**Fix:** Fall back to the stored access token on refresh failure:

```typescript
if (!refreshed) {
  return accessToken; // let the provider API decide -- better than returning null
}
```

---

### 9. Status route showing "not connected" for connected users

**Problem:** Status route used `makeAuthedClient` (user JWT + anon key with RLS). In this route context, `auth.uid()` was not resolving correctly, causing the RLS policy to block the read and return no row -- even though the row existed.

**Fix:** Switched to `getSupabaseAdmin()` (service role key). Auth is validated first via the user's JWT, then the admin client performs the read, bypassing RLS.

---

### 10. `unauthorized_client` -- wrong MICROSOFT_CLIENT_ID in env

**Problem:** `MICROSOFT_CLIENT_ID` in `.env.local` was set to the `keyId` of the client secret credential (visible in the manifest under `passwordCredentials[].keyId`), not the actual application ID (`appId`). Microsoft could not find an app registration matching that ID and returned:

> `unauthorized_client: The client does not exist or is not enabled for consumers`

This is easy to confuse because both values are GUIDs and the keyId happened to match the value seen in the Azure credentials UI.

**Fix:** Set `MICROSOFT_CLIENT_ID` to the correct `appId` from the app registration Overview page:

```env
# Wrong -- this was the secret keyId, not the app ID
# MICROSOFT_CLIENT_ID=14d828c0-036e-4ffb-b4f9-9a551430d6f0

# Correct -- the Application (client) ID from Overview
MICROSOFT_CLIENT_ID=2f8b675c-5eba-48a0-8f7f-23b0cff905e4
```

**How to find the correct value:** In Entra Admin Center -- App Registrations -- your app -- Overview -- "Application (client) ID" field. Do NOT use the value from Certificates & Secrets or the manifest `passwordCredentials` section.

---

## Guardrails

- Do NOT add `$orderby` to Microsoft Graph drive children endpoints -- returns 400.
- Do NOT use `$expand=thumbnails(select=...)` syntax -- use plain `$expand=thumbnails`.
- Treat `expires_at = null` as unknown expiry -- always refresh if a refresh token is available.
- When a provider returns 401/403, routes must return HTTP 401 with `reconnect: true` -- the UI depends on this.
- `ImportBrowser` must explicitly handle `error === 'reconnect'` before the generic error branch.
- Google Drive thumbnail URLs: always proxy through `/api/imports/google-drive/thumbnail` for `<img src>` display (requires auth header browsers cannot send). Store raw URL in `rawThumbnailUrl` for server-side use.
- When calling `resolve-selection`, send `rawThumbnailUrl ?? thumbnailUrl` -- never the proxy URL alone (relative paths fail in server-side `fetch`).
- `ImportGrid` must receive `accessToken` prop; `ItemThumbnail` must lazy-load via IntersectionObserver.
- Document MIME types (PDF, Word, Google Docs etc.) use `=s1200`; images use `=s800`.
- OneDrive thumbnails: prefer `large` over `medium` (direct CDN URLs, no proxy needed).
- `MICROSOFT_CLIENT_ID` must be the `appId` from the Overview page -- never the secret keyId.
- Status route must use `getSupabaseAdmin()`, not `makeAuthedClient`.
- Do NOT set `MICROSOFT_TENANT_ID` to a specific tenant -- use `common` to support personal accounts.
- Azure redirect URIs must never contain `#` fragments.

---

## Regression Checklist

1. Open Google Drive browser -> files and folders load in 3-column grid.
2. Open OneDrive browser -> files and folders load in 3-column grid.
3. Search Google Drive -> results appear.
4. Search OneDrive -> results appear.
5. Click a folder -> navigates into folder, breadcrumb updates.
6. Click a file -> file is selected (blue border + check badge).
7. Click "Select" -> resolves file and returns it to the parent component.
8. When token is expired -> after reconnecting, browser loads correctly.
9. When token is expired and reconnect not yet done -> `ConnectionRequiredDialog` shown (not inline error, not empty grid).
10. Thumbnails load lazily as you scroll (only visible + ~2 rows ahead fetch at a time).
11. Google Drive document thumbnails (PDF, Docs) are sharp and text is readable (~1200px).
11. Google Drive image thumbnails load at ~800px. OneDrive thumbnails load at large size.
12. Files without thumbnails fall back to file-type icon (Folder / Image / FileText).
12. Size shown in KB below filename for files with known size.
13. Connect OneDrive with personal hotmail/outlook account -> succeeds without `unauthorized_client`.
14. Status check (`/api/imports/status`) correctly returns `connected: true` for connected accounts.
