# PATCH-182 — drawn and cropped pictures are saved as files, not as text in the post

Status: AUTHORIZED (owner, 2026-09-25: "1 2 yes" — both the save-path change and moving the
existing pictures are allowed; the move is a later patch)
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Read first:
- `app/dashboard/canvas/[id]/CanvasClient.tsx`: the `<ImageDrawingLayer onSave>` arm (~L10744)
  and the `<ImageCropLayer onSave>` arm (~L10850);
- `lib/infra/collabboard/imageDurableContent.ts`;
- `lib/domain/knowledge/knowledgePdfAreaImagePolicy.ts` (read its header: PRIVACY IS THE WHOLE
  POINT);
- `lib/server/knowledge/knowledgePdfAreaImageServeRoute.ts` and
  `lib/server/knowledge/knowledgePdfAreaImageRoute.ts` (`canWriteBoard`, `uploadAreaImage`);
- `lib/domain/canvas/imagePostDisplaySource.ts`.

---

## 1. Why

Opening a board downloads about 1.4 MB of post data. The CTO measured the cause: when someone
draws on or crops an Image post, the finished picture is saved as a `data:` URL, i.e. the
whole PNG written as text inside the post row (`metadata.drawing`, `metadata.imageUrl`,
`file_url`). Every board load then downloads every such picture in full, uncached, inside the
posts query. On the owner's board:

| Post | Where | Size |
|---|---|---|
| `1989af88` (PDF area, in Library) | `file_url` + `metadata.drawing` | 508 kB + 508 kB |
| `fc01e253` (PDF area) | `metadata.drawing` + `metadata.imageUrl` | 172 kB + 168 kB |

A file in Storage is downloaded only when the picture is shown, and it is cached.

**Both heavy posts are PDF-area images.** A picture cut from a Knowledge PDF is as private as the
PDF: it lives in the private `knowledge-documents` bucket and is served only by
`/api/boards/{boardId}/padlets/{padletId}/image`, which re-checks board access on every
request. `padlet-files` is PUBLIC. **An edited PDF-area picture must NEVER be written to
`padlet-files` or to any other public bucket.** That rule decides the design.

## 2. The design

### 2.1 Pure helper — `lib/domain/canvas/imageDataUrl.ts` (new)

```ts
/** A base64 data URL of an image the editors produce, decoded; null for anything else. */
export function decodeImageDataUrl(value: unknown): { mimeType: 'image/png' | 'image/jpeg' | 'image/webp'; bytes: Uint8Array } | null;
export function isImageDataUrl(value: unknown): value is string;   // starts with "data:image/"
```

- Accepts only `data:image/png;base64,`, `data:image/jpeg;base64,` and `data:image/webp;base64,`.
- Anything else (another MIME type, not base64, empty, or malformed base64) → `null`.
- Browser-safe and Node-safe: no `Buffer`, no DOM.

### 2.2 Private write for PDF-area posts — the image route gets a `PUT`

Add a `PUT` to `app/api/boards/[id]/padlets/[padletId]/image/route.ts`, implemented as a new
handler factory in a new file, `lib/server/knowledge/knowledgePdfAreaImageEditRoute.ts`. Follow
the style of the serve route: an injected session, an `attempt()` wrapper, and a real Supabase
session.

- **Query:** `?variant=drawing|base`. A missing or unknown variant → 400.
- **Body:** the raw image bytes (`Content-Type: image/png`).
  - Refuse over `UPLOAD_LIMITS.image` (20 MB) with 413: check `Content-Length` before reading,
    then the byte length.
  - The first 8 bytes must be the PNG signature, or 400. The editors always produce PNG.
- **Checks, in this order** (each failure with the same status style the serve route uses):
  1. authentication;
  2. a rate limit of 120 edits per user per rolling hour (the same in-memory map shape as the
     upload route) → 429;
  3. `canWriteBoard(boardId)`, via the SAME authorizer `createRealKnowledgePdfAreaImageSession`
     uses → 403;
  4. the padlet exists ON THIS BOARD → 404 otherwise;
  5. `parseKnowledgePdfAreaProvenance(padlet.metadata)` is not null → 404 otherwise. This route
     is ONLY for PDF-area posts. It must never become a general writer to the private bucket.
- **Path:** derived only from validated ids, never from the request body. Add to the policy
  file:
  ```ts
  export type KnowledgePdfAreaImageVariant = 'drawing' | 'base';
  export function knowledgePdfAreaImageVariantPath(boardId, padletId, variant): string | null
  // `board-derived/{boardId}/pdf-areas/{padletId}.{variant}.png`, null unless both ids are UUIDs and the variant is known
  export function knowledgePdfAreaImageVariantUrl(boardId, padletId, variant, version: number): string | null
  // `/api/boards/{boardId}/padlets/{padletId}/image?variant={variant}&v={version}`
  ```
- **Write:** upload with the admin client to `KNOWLEDGE_STORAGE_BUCKET`, `upsert: true`,
  `contentType: 'image/png'`. The original area crop (`{padletId}.webp`) is never touched.
- **Response:** 200 `{ url }`, where `url` is `knowledgePdfAreaImageVariantUrl(..., Date.now())`.
  The `v` value only makes a new save a new `src`; the server ignores it.

### 2.3 Private read — the existing `GET` learns `?variant=`

In `knowledgePdfAreaImageServeRoute.ts`:
- **With NO `variant` parameter,** behaviour is byte-for-byte today's, including the direct
  branch and the durable-reuse branch.
- **With `variant=drawing|base`:** the same authentication, `canReadBoard`, the board-scoped
  padlet lookup and the provenance gate, all unchanged. Then download
  `knowledgePdfAreaImageVariantPath(...)`:
  - missing → 404, with NO durable-reuse fallback;
  - found → 200 with `Content-Type: image/png` and the same `Cache-Control: private, no-store`.
- An unknown variant value → 404.

### 2.4 The save — `lib/infra/collabboard/imageEditStorage.ts` (new, browser)

```ts
export type StoredImageEdit = { readonly url: string; readonly stored: 'public-file' | 'private-file' | 'inline' };
export async function storeEditedImage(input: {
  boardId: string; padletId: string; metadata: unknown;
  variant: 'drawing' | 'base'; dataUrl: string;
}): Promise<StoredImageEdit>;
```

- `dataUrl` that is not an image data URL → returned unchanged, with `stored: 'inline'` (nothing
  to move).
- **PDF-area post** (`parseKnowledgePdfAreaProvenance(metadata) !== null`): `PUT` the decoded
  bytes to the route in §2.2 and return its `url` (`stored: 'private-file'`).
- **Any other post:** upload through `createStorageGateway().upload('padlet-files', path, blob)`
  with path `image-edits/{boardId}/{padletId}/{variant}-{Date.now()}.png`, and return
  `getPublicUrl(...)` (`stored: 'public-file'`). This is the same bucket and the same gateway the
  board's own image uploads use, so PATCH-180's size check applies.
- **If storing fails for ANY reason:** return the data URL unchanged, with `stored: 'inline'`.
  - Never throw. The user's drawing must never be lost because Storage had a bad moment.
  - The save then behaves exactly as today.
  - Log once, with `console.warn('[image-edit] kept inline:', reason)`. Log no bytes and no URL.

### 2.5 Wiring — only the two save arms in `CanvasClient.tsx`

`ImageDrawingLayer.tsx` and `ImageCropLayer.tsx` are NOT changed: they keep returning data URLs.
Only the two `onSave` arms change.

**Draw arm:**
- `const drawn = await storeEditedImage({ boardId: <the board id this client already uses for the padlet, i.e. drawingPadlet.board_id>, padletId, metadata: drawingPadlet.metadata, variant: 'drawing', dataUrl })`.
- Then `metadata.drawing = drawn.url` and `imageUrl: drawn.url` for the placement.
- **The Library copy:** `persistDurableImageContent` gains an optional `libraryImageUrl`, which
  defaults to `imageUrl`.
  - For a PDF-area post, pass the ORIGINAL `dataUrl` as `libraryImageUrl`. The board-scoped
    private URL must not become the Library object's picture: it stops working when the card is
    deleted, and it would expose nothing to the Library's owner-scoped route. So the Library
    keeps exactly today's behaviour, and a follow-up moves it.
  - For any other post, `libraryImageUrl` is simply the stored public URL.
- **The authority check:** the `canEditBoardContentRef.current` check stays first. Check it
  again after `storeEditedImage` resolves and before `persistDurableImageContent`: an upload can
  take a while, and authority may have been revoked in between.

**Crop arm:** the same, with `variant: 'base'`.
- `imageUrl` (the placement's `file_url`) and `metadata.imageUrl` both become the stored URL.
- `drawing`, `drawingPaths` and `drawingText` stay null, as today.
- `deriveCropOriginalImageUrl` runs on the metadata BEFORE the change, as today.
- `syncLibrary: false` stays.

Reset Crop, the Library, `resolveImagePostDisplaySrc` and every reader are unchanged. A stored
URL is just a URL.

## 3. Tests

- **`lib/domain/canvas/imageDataUrl.test.ts`:**
  - png, jpeg and webp decode;
  - svg, `text/plain`, non-base64, empty and malformed input → null;
  - the decoded bytes round-trip exactly.
- **`lib/server/knowledge/knowledgePdfAreaImageEditRoute.test.ts`**, with an injected session in
  the style of the serve route's tests:
  - unauthenticated → 401;
  - no write access → 403, and nothing is uploaded;
  - a padlet on another board → 404;
  - a padlet WITHOUT PDF-area provenance → 404, and nothing is uploaded;
  - a bad variant → 400;
  - a non-PNG body → 400;
  - over 20 MB by `Content-Length` → 413, and the body is never read;
  - the 121st edit in an hour → 429;
  - success uploads to EXACTLY `board-derived/{b}/pdf-areas/{p}.drawing.png` in the private
    bucket with upsert, and returns the variant URL;
  - the path never contains anything from the body.
- **The serve route test** (ADD, keeping every existing assertion):
  - without `variant`, today's behaviour, with one assertion on the direct branch;
  - `variant=drawing` serves the variant object as `image/png` with `private, no-store`;
  - a missing variant object → 404, and the durable lookup is NOT called;
  - `variant=drawing` for a non-PDF-area padlet → 404;
  - no read access → 403.
- **`lib/infra/collabboard/imageEditStorage.test.ts`:**
  - a PDF-area post PUTs to the private route and NEVER calls the storage gateway;
  - a normal post uploads to `padlet-files` under `image-edits/{b}/{p}/`;
  - a failed upload, and separately a failed PUT → `{ url: dataUrl, stored: 'inline' }` with no
    throw;
  - a non-data URL is returned as is.
- **`imageDurableContent` test** (ADD): `libraryImageUrl` is written to the Library row's
  `file_url` and `thumbnail_url` while the placement gets `imageUrl`; when omitted, both get
  `imageUrl`.
- **A source-level wiring test** (new, in the style of the repo's `*.source.test.ts` files):
  - both CanvasClient save arms call `storeEditedImage`;
  - `ImageDrawingLayer.tsx` and `ImageCropLayer.tsx` contain no `storeEditedImage` and no
    `padlet-files`;
  - `imageEditStorage.ts` never names `padlet-files` on the PDF-area branch. Assert it
    structurally: the provenance check comes before the gateway call, and it returns.

## 4. Allowed files

```
lib/domain/canvas/imageDataUrl.ts, imageDataUrl.test.ts                               (new)
lib/domain/knowledge/knowledgePdfAreaImagePolicy.ts                                    (variant path/url helpers only)
lib/server/knowledge/knowledgePdfAreaImageEditRoute.ts, its test                       (new)
lib/server/knowledge/knowledgePdfAreaImageServeRoute.ts and its existing test          (the variant branch; additions)
app/api/boards/[id]/padlets/[padletId]/image/route.ts                                  (export PUT)
lib/infra/collabboard/imageEditStorage.ts, imageEditStorage.test.ts                    (new)
lib/infra/collabboard/imageDurableContent.ts and its existing test                     (libraryImageUrl; additions)
app/dashboard/canvas/[id]/CanvasClient.tsx                                             (ONLY the two onSave arms)
one new source-level wiring test
```

Everything else is forbidden, including `ImageDrawingLayer.tsx`, `ImageCropLayer.tsx`,
`FreeformPadletCards.tsx`, the Excalidraw drawing board, migrations, storage policies and
`package.json`.

`CanvasClient.tsx` has CRLF line endings: edit it in a way that keeps them. If a census or
wiring test names these files and needs an update, STOP and ask. Never touch the database.
Never use git stash, reset, restore, checkout, clean, commit or push. Never run a production
build.

## 5. Verification

```
npx tsc --noEmit
npx vitest run lib/domain/canvas lib/server/knowledge lib/infra/collabboard lib/domain/knowledge
npx vitest run
```

The failing FILE set must equal the 26-file baseline. Report:
- the files you changed and the tests you added;
- the output;
- how the board id is obtained in each save arm.

Do not commit.

The CTO verifies live:
- draw on a normal Image post and on a PDF-area post;
- the saved post holds a URL, not `data:`;
- the picture looks the same;
- the PDF-area picture's URL is the private route;
- the posts payload shrinks.

## 6. Commit message (verbatim)

```
perf(images): drawn and cropped pictures are saved as files, not as text in the post

Drawing on or cropping an Image post saved the finished picture as a data: URL inside the
post itself, so every board load downloaded every edited picture in full, uncached, with the
post list. They are now saved as files. An ordinary image goes to the same bucket as the
board's other uploads. A picture cut from a Knowledge PDF stays exactly as private as the PDF:
it is stored in the private bucket next to the original area image and served only by the
board route that re-checks access on every request. If storing fails, the edit is saved the
old way, so no drawing is ever lost. The drawing and crop tools themselves are unchanged.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
