# PATCH-218 — "Upload your own" stores the picture as a file, and drag and drop works

Status: AUTHORIZED (owner, 2026-09-30: "yes"; part of the Image consolidation; the CTO found this
while planning it).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-217 (`3be080c8`)

## Why (CTO)
1. **The picture goes into the database row.** `ImageEditor.tsx` `handleFileUpload` (~229-240) reads
   the chosen file with `readAsDataURL`, and "Add Image" saves that base64 `data:` URL as
   `file_url`, `metadata.imageUrl`, and the Image Library row's `file_url` and `thumbnail_url`
   (`usePadletSave.ts` `saveImage` ~1433-1530). So every board load and every Library load downloads
   the full picture inside the JSON. The codebase says so itself (`CanvasClient.tsx` ~6138: "the Add
   Image modal's upload tab, which persists a base64 data URL instead of a real storage URL").
   PATCH-182 fixed the same problem for drawn-on and cropped pictures (`storeEditedImage` in
   `lib/infra/collabboard/imageEditStorage.ts`); new uploads were never fixed.
2. **"Drag and drop your image here" does nothing.** The zone (~470-490) has no drop handler.

## Design
1. **Helper** `storeUploadedImage({ boardId, file }): Promise<{ ok: true; url: string } | { ok: false; message: string }>`
   in `lib/infra/collabboard/imageEditStorage.ts`, next to `storeEditedImage`, with the same gateway
   and bucket:
   - Refuse non-images (`!file.type.startsWith('image/')`) → `Please choose an image file.`
   - Refuse files over `UPLOAD_LIMITS.image` → the message from `tooLargeMessage(file.size, UPLOAD_LIMITS.image, 'images')`.
   - Upload the File as it is (no re-encoding) to
     `padlet-files/image-uploads/<boardId>/<crypto.randomUUID()>.<ext>`. The extension comes from the
     MIME type (jpeg→jpg, png, gif, webp, svg+xml→svg, else the part after `image/`, sanitised to
     `[a-z0-9]`). The user's filename is NOT used in the path.
   - Return `getPublicUrl(...)`. On failure → `{ ok: false, message: 'Could not upload the image. Please try again.' }`.
   - **Unlike `storeEditedImage`, never fall back to an inline data URL.** For a new upload, an error
     the user can retry is better than silently recreating the bloat. Never throws.
2. **ImageEditor** (`components/collabboard/editors/ImageEditor.tsx`):
   - A new prop `boardId?: string`, passed by `CanvasModals` (it has the canvas id; use whatever it
     already holds and say which).
   - Choosing a file keeps the `File` in state and previews it with `URL.createObjectURL`. Revoke the
     old URL on change, close and unmount. It no longer uses `readAsDataURL`. Validate type and size
     at once and show the message INLINE under the drop zone (red, small); an invalid file leaves no
     preview.
   - **Drag and drop:** the dashed zone gets `onDragOver` (preventDefault, plus a highlighted border
     while dragging) and `onDrop`. The first image file in `dataTransfer.files` goes through the same
     path as choosing it. Several files take only the first here; PATCH-219 adds multi-image.
   - **Save:** when the current picture came from an uploaded File, "Add Image" first calls
     `storeUploadedImage({ boardId, file })`. While it runs, the button reads `Uploading…` and is
     disabled. On success, `onSave({ …, imageUrl: <the storage url>, source: 'upload' })`, the same
     payload as today apart from the URL. On failure, the message shows inline, the dialog STAYS OPEN,
     and `onSave` is NOT called. If `boardId` is missing, show `Could not upload the image.` and do not
     save.
   - Pexels pictures and imports are unchanged; they already carry real URLs.
3. Existing posts that already hold data URLs are left alone (they still render). Moving them is a
   separate, optional clean-up.

## Tests
- `imageEditStorage.test.ts` (extend it):
  - an image uploads to a path matching `^image-uploads/<board>/[0-9a-f-]{36}\.jpg$` for image/jpeg,
    and returns the public URL;
  - the filename is not in the path;
  - text/plain → refused, no upload;
  - over the limit → the tooLarge message, no upload;
  - a gateway failure → `{ ok: false }`, with NO data URL anywhere in the result.
- `ImageEditor.test.tsx`:
  - choose a PNG → a blob: preview;
  - "Add Image" → `storeUploadedImage` is called, then `onSave` with the storage URL, and the saved
    `imageUrl` does not start with `data:`;
  - an upload failure → the message is visible, `onSave` is not called, the dialog is still open;
  - dropping an image file on the zone → the same preview;
  - a non-image or oversize file → the inline message, and no preview.
- **Mutation:** save `previewUrl` instead of the uploaded URL → the "not data:/blob:" test fails.

## Allowed files
```
lib/infra/collabboard/imageEditStorage.ts (+ its test)
components/collabboard/editors/ImageEditor.tsx (+ ImageEditor.test.tsx)
components/collabboard/canvas/ui/CanvasModals.tsx   (pass boardId only)
```
Forbidden:
- `CanvasClient.tsx`, `usePadletSave.ts`;
- the database, storage policies, `package.json`, `next.config.ts`, `.env*`.

`imageEditStorage.source.test.ts` may pin this module's source. If it does, STOP and ask (spec
line, code at file:line, proposed resolution).

Use the Grep/Read tools, or `rg` with `timeout 30`. Every test command is
`timeout 600 npx vitest run …`. No `ls` on the repo root, no curl of the dev server. Delete temp
files (bash: `/dev/null`, never `nul`). No stash/reset/restore/checkout/clean/commit/push; no
production build. Real tool calls only.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/infra/collabboard components/collabboard/editors
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-218.json
```
The failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

**Live (CTO, own tab):**
- Image → Upload your own → choose a small test picture (the CTO creates one) → Add Image → the card
  shows it, and the post's `file_url` is a `…/storage/v1/object/public/padlet-files/image-uploads/…`
  URL, not `data:`;
- dropping a file works the same way;
- the CTO deletes the test card afterwards.

## Commit message (verbatim)
```
fix(images): an uploaded image is stored as a file, and drag and drop works

The Image window's upload tab saved the picture as a base64 data URL
inside the post row and its Library item, so every board load carried
every uploaded picture in full. It now stores the file in padlet-files
under a random name and saves only its URL, as drawn and cropped images
already do; an upload failure keeps the window open with a message
instead of falling back to inline data. The "drag and drop your image
here" zone now accepts a dropped image.
```

## Addendum (CTO, 2026-09-30): live result
- Chosen file: the preview is a `blob:` URL; "Add Image" → storage upload 200 →
  `create_image_post_with_library_item` with `p_file_url` =
  `…/storage/v1/object/public/padlet-files/image-uploads/<board>/<uuid>.png`. Neither the file URL
  nor `metadata.imageUrl` is a `data:` URL.
- Dropped file: the same, with a preview and a storage upload of 200.
- Both test cards were deleted afterwards. Their Image Library entries remain (the owner was told).
