# PATCH-180 — upload size limits, so a board cannot be filled with huge files

Status: AUTHORIZED (owner, 2026-09-25: PDF 50 MB, images 20 MB, files 50 MB, 30 PDF uploads/hour)
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`

---

## 1. Why

The owner raised it: a board can be filled with multi-hundred-megabyte files, and that costs
real money. Storage has no quota, and every PDF also starts the server-side extraction worker.
The CTO checked, and the app enforces NO upload size anywhere:

| Path | Code today |
|---|---|
| Knowledge upload (PDF, and text sources: .docx/.md/.txt) — `lib/server/knowledge/knowledgeUploadRoute.ts` | no maximum. It reads the whole body into server memory first. `validateKnowledgePdf` even says so: "P4 enforces no maximum and the policy gap is reported". |
| Browser uploads (post images and files, avatars…) — `lib/infra/supabase/storage.ts` `SupabaseStorageGateway.upload` | no check; goes straight to the Supabase bucket |
| Buckets `knowledge-documents`, `padlet-files`, `avatars` | no `file_size_limit` |
| Transcripts | 8 MB (already fine) |

Browser uploads never pass through our server, so **the bucket limit is the real enforcement**.
The code checks exist to give the user a clear message early, and to stop the server from
reading a huge body into memory.

## 2. The limits — one module, `lib/domain/storage/uploadLimits.ts` (new, pure)

```ts
export const MB = 1024 * 1024;
export const UPLOAD_LIMITS = {
  knowledgePdf: 50 * MB,     // = KNOWLEDGE_DERIVATIVE_MAX_SOURCE_BYTES; larger is not rendered anyway
  knowledgeText: 20 * MB,    // .docx / .md / .txt sources
  image: 20 * MB,            // post images
  file: 50 * MB,             // any other post file
  avatar: 5 * MB,
} as const;
export const KNOWLEDGE_UPLOADS_PER_HOUR = 30;

/** "72.4 MB" / "850 KB": one decimal for MB, none for KB. */
export function formatBytes(bytes: number): string;

/** The user-facing refusal, e.g. "This file is 72.4 MB. The limit for PDFs is 50 MB." */
export function tooLargeMessage(sizeBytes: number, limitBytes: number, kindLabel: string): string;

/** Which browser-upload limit applies: bucket + MIME type → limit in bytes, or null when this patch sets none. */
export function browserUploadLimit(bucket: string, mimeType: string): number | null;
//   'padlet-files' + image/*       → image
//   'padlet-files' + anything else → file
//   'avatars'                      → avatar
//   any other bucket               → null (unchanged behaviour)
```

Also add `lib/domain/storage/uploadLimits.test.ts`.

## 3. Server — the Knowledge upload

**`lib/server/knowledge/knowledgeUploadRoute.ts`** (the POST handler), in this order:
1. **Auth**, exactly as now.
2. **Rate limit:** at most `KNOWLEDGE_UPLOADS_PER_HOUR` uploads per user per rolling hour, using
   the same in-memory map shape the AI routes use. Over the limit → 429,
   `{ error: 'Too many uploads. Try again in a while.' }`.
3. **Declared size, BEFORE reading the body.** If `Content-Length` is present and greater than
   `UPLOAD_LIMITS.knowledgePdf + 1 MB` (multipart overhead) → 413,
   `{ error: 'This file is too large. The limit is 50 MB.' }`.
4. `formData()`, as now.
5. **File size, BEFORE `arrayBuffer()`.** `file.size` over the limit for its kind → 413 with
   `tooLargeMessage(...)`. The kind comes from the same PDF-or-text routing the handler already
   does: find where it decides, and decide it once, before reading the bytes.
   - PDF: `knowledgePdf`, label `PDFs`.
   - Text source: `knowledgeText`, label `documents`.

Keep every existing response for existing cases.

**Defence in depth in the domain.** `validateKnowledgePdf` (`knowledgeIngestion.ts`) refuses
more than `UPLOAD_LIMITS.knowledgePdf` with `validation`, and its "no maximum" NOTE is replaced
by one line pointing at `uploadLimits.ts`. Do the same for the text-source validation in
`knowledgeTextUpload.ts`: find where it validates the file, with `knowledgeText`. The route
maps these errors exactly as it maps other validation errors today, with no new status code.

## 4. Browser — clear messages before uploading

- **`SupabaseStorageGateway.upload`:** when `browserUploadLimit(bucket, file.type)` is a number
  and `file.size` exceeds it, return `err(domainError('validation', tooLargeMessage(...)))`
  WITHOUT calling Supabase. Labels: `images` / `files` / `profile pictures`.
- **Callers keep working.** If a caller shows a fixed "Could not upload" text, leave it; the
  bucket enforces anyway. Do NOT edit callers in this patch. List in your report which callers
  already show `error.message`.
- **`components/collabboard/KnowledgePdfUploader.tsx`:** before POSTing, if the chosen file is
  larger than its limit, show `tooLargeMessage(...)` in the uploader's existing error spot and
  don't send. A PDF is detected the way the uploader already detects it; otherwise use the text
  limit.

## 5. The buckets — a migration the OWNER applies

**`supabase/migrations/20260925100000_storage_upload_size_limits.sql`** (new). The CTO and
DeepSeek never apply it: only the owner does.

```sql
-- PATCH-180. Upload size limits enforced by Storage itself: browser uploads go straight
-- to the bucket and never pass the app server, so this is the real enforcement.
-- UPDATE, not INSERT: a bucket that does not exist is left alone.
UPDATE storage.buckets SET file_size_limit = 52428800 WHERE id = 'knowledge-documents';  -- 50 MB
UPDATE storage.buckets SET file_size_limit = 52428800 WHERE id = 'padlet-files';         -- 50 MB
UPDATE storage.buckets SET file_size_limit = 5242880  WHERE id = 'avatars';              -- 5 MB
-- Rollback: UPDATE storage.buckets SET file_size_limit = NULL WHERE id IN ('knowledge-documents','padlet-files','avatars');
```

Before writing it, check `supabase/migrations/` for how bucket changes are written (for example
`20260820_provision_knowledge_documents_bucket.sql`) and match the style. Also check whether a
repo test enumerates migrations, and if one does, make it pass. Images stay capped at 20 MB in
the browser only, because one bucket holds both images and files.

## 6. Tests

- **`lib/domain/storage/uploadLimits.test.ts`:** every `browserUploadLimit` branch, including
  `null` for an unknown bucket; `formatBytes` at KB/MB boundaries; the exact
  `tooLargeMessage` text.
- **`lib/server/knowledge/knowledgeUploadRoute.test.ts`** (ADD; keep every existing
  assertion):
  - a `Content-Length` over the limit → 413, and `formData` is never called;
  - a 51 MB PDF `file.size` → 413 with the exact message, and `arrayBuffer` is never called;
  - a 21 MB text source → 413;
  - a 49 MB PDF passes the size gate;
  - the 31st upload in an hour → 429, and the 30th passes.
- **The validators' tests** (the files that test `validateKnowledgePdf` and the text
  validation; ADD): over the limit → `validation`, and exactly the limit → ok.
- **`lib/infra/supabase/storage.test.ts`** (ADD): an oversized image or file for `padlet-files`
  → a `validation` error and NO Supabase call; an image and a non-image are each measured
  against their own limit; an unknown bucket → no check.
- **`KnowledgePdfUploader`:** find its test file (ADD). An oversized file shows the message and
  makes no fetch.

## 7. Allowed files

```
lib/domain/storage/uploadLimits.ts, uploadLimits.test.ts                (new)
lib/server/knowledge/knowledgeUploadRoute.ts, knowledgeUploadRoute.test.ts
lib/domain/knowledge/knowledgeIngestion.ts, lib/domain/knowledge/knowledgeTextUpload.ts
  and the test files that already test their validators                (additions only)
lib/infra/supabase/storage.ts, storage.test.ts
components/collabboard/KnowledgePdfUploader.tsx and its existing test   (additions only)
supabase/migrations/20260925100000_storage_upload_size_limits.sql       (new; NOT applied)
```

Everything else is forbidden, including callers of the storage gateway, other tests and
`package.json`. **Never apply a migration or run any command against the database.** Never use
git stash, reset, restore, checkout, clean, commit or push. Never run a production build.

## 8. Verification

```
npx tsc --noEmit
npx vitest run lib/domain/storage lib/server/knowledge lib/domain/knowledge lib/infra/supabase components/collabboard/KnowledgePdfUploader
npx vitest run
```

The failing FILE set must equal the 26-file baseline. Report:
- the files you changed and the tests you added;
- the output;
- which gateway callers surface `error.message` (§4).

Do not commit.

## 9. Commit message (verbatim)

```
feat(storage): upload size limits, so a board cannot be filled with huge files

Nothing limited how large an uploaded file could be: a PDF or document went into server
memory whole, and images and files went straight from the browser into Storage. A board
could be filled with multi-hundred-megabyte files, which costs real money in storage and in
the PDF worker that processes each one.

PDFs are now limited to 50 MB (the size above which pages were never rendered anyway),
documents to 20 MB, post images to 20 MB, other post files to 50 MB and profile pictures to
5 MB. The server refuses an oversized upload before reading it, and a user may add at most
30 Knowledge files an hour. The browser says so before uploading, with the file's size and
the limit. A migration sets the same limits on the Storage buckets themselves, which is the
enforcement that holds even for uploads that never pass the app; it is applied by the owner.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
