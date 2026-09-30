# PATCH-216 — An imported PDF, Word file or Google Doc can become a readable document

Status: AUTHORIZED (owner, 2026-09-30: "Ok yes you are the PM I follow you").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-214b (`50e6ad09`)

## Why
"Import post" from Google Drive or OneDrive makes an IMAGE card: a preview picture plus a link that
opens the file in Drive. The wiki and the board AI never see what is inside. A PDF uploaded from the
computer takes a different path: it becomes a knowledge document with its own card, which opens in
the reader and feeds the wiki, the AI and its citations. The owner's goal is for content to reach
the wiki and the AI with no guessing, so an imported document should be able to take that same path.

## Design (the CTO's decisions)
The whole existing upload path is reused UNCHANGED:
- plan limits and size limits;
- board authorization;
- PDF / .docx / text handling;
- the PDF card placement (`handleKnowledgePdfUploaded`);
- processing notices and polling.

The only new server work is fetching the file's bytes from the provider. The browser then hands
those bytes to the existing uploader, exactly as if the user had picked the file on their computer.

### 1. Server: `GET /api/imports/download?provider=…&itemId=…` (new route)
- Auth: `getAuthenticatedUserId` (the bearer header), as the other import routes do. 401 if absent.
- Validate `provider` and `itemId` with the SAME patterns as `resolve-selection`. Move
  `ITEM_ID_PATTERNS` into `lib/imports/providerUrls.ts` as an export, and import it in both routes.
  No behaviour change to resolve-selection.
- Token: `getValidAccessToken`; null → 401 `{ error: 'Not connected', reconnect: true }`.
- Resolve the item with `resolveGoogleDriveItem` / `resolveOneDriveItem` (name, mimeType, size).
  null → 404; folder → 400.
- **Supported types** (anything else → 415 `{ error: 'Only PDF, Word, text and Google Docs files can be added as documents.' }`):
  - `application/pdf`;
  - `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (.docx);
  - `text/plain`, `text/markdown`;
  - Google Doc `application/vnd.google-apps.document`, EXPORTED as `application/pdf`, with filename
    `<name>.pdf`.
  Put the list and the mapping in a pure helper `documentImportPlan(provider, item)` in
  `lib/imports/documentImport.ts` (new). It returns
  `{ kind: 'download' | 'export-pdf', filename, contentType } | { refused: string }`.
- **Size:** refuse early (413, using `tooLargeMessage` from `lib/domain/storage/uploadLimits.ts`)
  when the provider's `sizeBytes` exceeds `UPLOAD_LIMITS.knowledgePdf` for PDFs, or
  `UPLOAD_LIMITS.knowledgeText` for the others. ALSO cap the bytes actually read: stop, and answer 413,
  once the body passes the limit (Google Doc exports have no size up front).
- **Fetching the bytes:**
  - Google: download `https://www.googleapis.com/drive/v3/files/{id}?alt=media`; export
    `https://www.googleapis.com/drive/v3/files/{id}/export?mimeType=application/pdf`; both with the
    bearer token.
  - OneDrive: add `getOneDriveDownloadUrl(token, itemId)` to `lib/imports/oneDrive.ts`. It reads the
    item's `@microsoft.graph.downloadUrl` (a pre-signed URL) and returns it, or null. Add a sibling
    `downloadGoogleDriveFile(token, id, plan)` to `googleDrive.ts` only if that keeps the route
    small; your choice, say which.
  - **Redirects:** `redirect: 'manual'`. On a 3xx, follow ONE hop only if the `Location` passes
    `isAllowedThumbnailUrl(provider, url)`, and send that hop WITHOUT the Authorization header. The
    OneDrive pre-signed URL must pass the same check and is fetched without the token. Anything else
    → 502 `{ error: 'Could not download the file.' }`.
- **Response:** the bytes, with `Content-Type` (from the plan), `Cache-Control: no-store`, and header
  `X-Import-Filename: <encodeURIComponent(filename)>`. Never log the token or the file contents.

### 2. Client helper: `downloadImportedDocument(provider, itemId, signal)` in `lib/imports/clientApi.ts`
Same auth-header helper as the other calls. Returns a `File`: the name comes from `X-Import-Filename`
(decoded), the type from `Content-Type`. On a non-OK response, throw `ImportAuthError` for 401
(as the other calls do), and otherwise an `Error` carrying the server's `error` string, bounded to
200 chars.

### 3. The uploader accepts a file from code
In `components/collabboard/KnowledgePdfUploader.tsx`, extend `KnowledgePdfUploaderHandle` with
`uploadFile(file: File): void`. It calls the EXISTING `handleFile(file)`: the same `mayInitiateNow`
gate, size check, notices, upload, `onDocumentUploaded` placement and polling. No second path.
`CanvasSidebar` gets an optional `knowledgeUploaderRef?: React.Ref<KnowledgePdfUploaderHandle>` prop,
passed to its `<KnowledgePdfUploader ref=…>`.

### 4. The choice in "Import Preview"
`components/collabboard/editors/ImageEditor.tsx`, import mode only:
- A new optional prop `onImportAsDocument?: (importData) => void`.
- When that prop is given AND `importData.mimeType` is one of the supported types (use the SAME
  helper from `documentImport.ts`; export a `isDocumentImportable(mimeType)` for the client), show a
  choice above the footer. It is two radio options with a `name`, and each has a stable `id`:
  - **"Link to the original"**: "A card with a preview that opens the file in Google Drive"
    (or "OneDrive"). This is the DEFAULT.
  - **"Add as a readable document"**: "A copy is added to this board, so the wiki and the board AI
    can read it".
- With "readable document" chosen, the purple button reads **"Add as document"**, and clicking it
  calls `onImportAsDocument(importData)` then `onClose()`. It does NOT call `onSave`, so no image
  card is created.
- Otherwise the behaviour is exactly as today.

### 5. Wiring in the canvas
- `CanvasClient.tsx`: `const knowledgeUploaderRef = useRef<KnowledgePdfUploaderHandle>(null)`,
  passed to `<CanvasSidebar knowledgeUploaderRef={…}>`.
- A handler `importAsKnowledgeDocument(importData)`:
  1. `if (!canEditBoardContentRef.current) return;`
  2. if `!canPlaceDirectPdf` or the ref is null → `toast.error('Documents can be added on Freeform canvases only')`;
  3. otherwise `toast.loading('Downloading <fileName>…')`, then
     `downloadImportedDocument(provider, itemId)`, then dismiss that toast and call
     `knowledgeUploaderRef.current.uploadFile(file)`. The uploader shows its own "Uploading… /
     Processing… / ready" notices from there.
  4. Errors → dismiss the toast and `toast.error(message)`; `ImportAuthError` →
     `'Your Google Drive connection expired. Please reconnect in Settings.'` (or OneDrive).
- Pass it through `CanvasModals` to the import `<ImageEditor onImportAsDocument={…}>`. Pass it only
  where `canPlaceDirectPdf` is true, so other layouts never see the choice.
- Keep the CanvasClient diff small: put the handler's body in a small tested function in
  `lib/imports/documentImport.ts` or a hook next to it, with CanvasClient only wiring it.

## Tests
- `documentImport.test.ts`:
  - PDF → download;
  - .docx → download;
  - text/plain and text/markdown → download;
  - Google Doc → export-pdf, with filename `X.pdf`;
  - Google Sheet or an image → refused;
  - `isDocumentImportable` agrees with `documentImportPlan` for every one of these.
- `app/api/imports/download/route.test.ts` (mock auth, token, resolvers, fetch):
  - no auth → 401;
  - a bad itemId → 400, with no resolver call;
  - a Sheet → 415;
  - an oversize `sizeBytes` → 413 with no download fetch;
  - a stream larger than the limit → 413;
  - a Google PDF → 200 with bytes, content-type and `X-Import-Filename`, and the Authorization
    header sent to googleapis;
  - a Google Doc → the export URL is fetched;
  - OneDrive → the downloadUrl is fetched WITHOUT Authorization;
  - a redirect to a non-allowlisted host → 502 and no second fetch;
  - an allowlisted redirect → one hop without Authorization.
- `clientApi`: `downloadImportedDocument` builds a File with the decoded name and type, and a 401
  throws `ImportAuthError`.
- `KnowledgePdfUploader`: `uploadFile` through the ref posts the file, like choosing it in the input
  (reuse the existing test setup), and does nothing when `canInitiateUploadNow` is false.
- `ImageEditor`:
  - the choice appears only in import mode, for a PDF, when `onImportAsDocument` is given;
  - it is absent for an image, and absent without the prop;
  - "Link" is the default, and saving calls `onSave`;
  - choosing "readable document" changes the button label, calls `onImportAsDocument` and NOT
    `onSave`.
- **Mutations:**
  - send the Authorization header to the OneDrive downloadUrl → its test fails;
  - make "readable document" also call `onSave` → its test fails.
- If a new test path is not in `vitest.config.ts`'s `include`, add the narrowest pattern (authorized)
  and confirm it appears in the JSON.

## Allowed files
```
app/api/imports/download/route.ts (+ test)                        (new)
app/api/imports/resolve-selection/route.ts   (only: import ITEM_ID_PATTERNS from providerUrls)
lib/imports/providerUrls.ts                  (export ITEM_ID_PATTERNS)
lib/imports/documentImport.ts (+ test)                            (new)
lib/imports/clientApi.ts (+ test if one exists; else new clientApi.test.ts)
lib/imports/oneDrive.ts, lib/imports/googleDrive.ts   (download helpers only)
components/collabboard/KnowledgePdfUploader.tsx (+ its existing test)   (uploadFile on the handle only)
components/collabboard/canvas/ui/CanvasSidebar.tsx   (the ref prop only)
components/collabboard/editors/ImageEditor.tsx (+ test)
components/collabboard/canvas/ui/CanvasModals.tsx   (pass the prop only)
app/dashboard/canvas/[id]/CanvasClient.tsx   (the ref, the handler wiring, the props only)
vitest.config.ts                             (an include pattern only, if needed)
```
Forbidden:
- the database, storage settings, migrations, `package.json`, `next.config.ts`, `.env*`;
- the knowledge upload route and its ingestion code, which are reused unchanged;
- `ImportBrowser.tsx`, `GoogleDrivePickerLauncher.tsx`.
**Do not touch the comments inside `isBlockingEditorModalOpen`.** If a census or source test pins
any of these files (CanvasClient and CanvasSidebar have censuses), STOP and ask (spec line, code at
file:line, proposed resolution).

Use `rg` or `timeout 30` for searches. Every test command is `timeout 600 npx vitest run …`. Delete
temporary diagnostic files (bash: `/dev/null`, never `nul`); do NOT run `ls` on the repo root; do
NOT curl the dev server (the CTO does the live checks). No stash/reset/restore/checkout/clean/commit/
push; no production build. Real tool calls only. Never print or log a token.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/imports app/api/imports components/collabboard/imports components/collabboard/editors components/collabboard/KnowledgePdfUploader
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-216.json
```
The failing FILE set must equal the 26-file baseline, and every new test file must be present in the
JSON. Compact report. Do not commit.

**Live (CTO, own tab):**
- Import → Google Drive → pick a harmless test PDF (the CTO asks the owner which one) → choose "Add
  as a readable document" → a PDF card appears, is processed, and opens in the reader; the board AI
  can answer from it.
- The same with "Link to the original" still makes the image card.
- The CTO deletes the test card and document afterwards, or asks the owner to.

## Commit message (verbatim)
```
feat(imports): an imported PDF, Word file or Google Doc can become a readable document

Importing from Google Drive or OneDrive made only a picture with a link,
so the wiki and the board AI never saw what the file said. Import
Preview now offers "Add as a readable document": the server fetches the
file from the provider (a Google Doc is exported as PDF) and the browser
hands it to the same uploader a computer upload uses, so it becomes a
normal document card with the same limits, processing, reader and AI.
"Link to the original" stays the default.
```

## Addendum (CTO, 2026-09-30): live result
- Live bug found and fixed: the Import Preview reset the choice to "Link" on every parent re-render
  (`initialData` is built inline by CanvasModals), so "Add as document" created an image card. The
  reset now runs only on open or when the item changes. A regression test re-renders with a new,
  equal `initialData`; the mutation was caught.
- Live, CTO's own tab: Google Drive → blockbusters.pdf (a file the owner had put on the board) →
  "Add as a readable document". The requests after the click: /api/imports/download → POST
  /knowledge → a padlet placed → processing. The document `503d0b43…` reached `ready`, and the card
  shows the page previews.
- Not checked live: an AI answer from it. It is the same ingestion path as every uploaded PDF.
- Clean-up: the four stray link cards from the CTO's runs before the fix were deleted; the owner's
  two cards were kept. Their Image Library entries were not touched (the owner was told).
