# Knowledge PDF storage lifecycle

Knowledge source PDFs live in the private `knowledge-documents` bucket at:

```text
knowledge/{boardId}/{documentId}/original.pdf
```

The original filename is metadata only. `raw_artifact_path` is an optional
second artifact path and is deleted with the original when present.

## Rendered page derivatives (P6J-F9)

Rendered page images live in the same private bucket at:

```text
knowledge/{boardId}/{documentId}/pages/{pageNumber}.webp
```

They are **optional enhancement data**, owned by the Knowledge PDF worker and
generated at ingest (F9-A1). A document that is not derivative-eligible still
extracts, still becomes `ready`, and still reads as text — a missing page image
is never an ingestion failure. `knowledgePdfRenderPolicy.ts` owns eligibility
(at most 52,428,800 source bytes and 200 pages) and the path, which is fully
deterministic: 1-based pages, no random suffix, no signed URL, never the user's
filename, and UUID-only ids — anything else yields no path rather than being
sanitised into a different valid one.

### Raster model (P6J-F9-A1b)

`workers/knowledge-pdf/pdfPageRaster.ts` exists but is **not yet wired into
ingest** — A1c owns invoking it and uploading its output. It renders
worker-side only, through PDF.js on the `@napi-rs/canvas` backend: WebP at
quality 80 on an opaque `#FFFFFF` background (a PDF page is paper; undrawn area
must not read as transparent), at
`scale = min(2, 2000 / widthPoints, 2000 / heightPoints)` computed purely from
intrinsic PDF points — never magnified past 2×, never from a device pixel
ratio, CSS pixel, drawer width or browser viewport. At most 2000 × 2000 and
4,000,000 px per page and 400,000,000 px per document; a page breaching a limit
is skipped, never clamped into an arbitrary image. Pages render one at a time
with a 20s timeout. The derivative path is unchanged.

**Rotation, and what F9-B must not get wrong.** Derivatives apply the page's
intrinsic rotation, matching what a PDF viewer shows. But
`knowledge_pages.width_points` / `height_points` are stored **unrotated**
(`pdfGeometry.ts` measures at `rotation: 0`), so for a 90°/270° page the
rendered image's dimensions are **transposed** relative to stored geometry.
F9-B `normalized-page-top-left` regions will be selected against the rendered
image, so mapping them back onto stored geometry must account for that
rotation. F9-B is not solved here; this note exists so the mismatch is found by
reading rather than by debugging.

## Deletion boundaries

- Dashboard trash (`app/dashboard/page.tsx`) is a soft-delete update to
  `boards.deleted_at`; it intentionally does not delete Knowledge rows or
  binaries so a trashed board can remain recoverable.
- Physical board deletion is the server-only `DELETE /api/boards/[id]` path.
  It authenticates first, authorizes the board owner, captures every document
  artifact path, deletes the board so Postgres cascades its Knowledge rows,
  then removes the captured Storage objects.
- `deleteKnowledgeDocument` uses the same post-DB artifact cleanup helper.
- Page derivatives go through that same helper. Their paths are *derived* from
  the captured `page_count`, never discovered — the gateway is `upload`/`remove`
  only and no listing API is introduced. A null `page_count` contributes none,
  and enumeration is deliberately **not** capped at the 200-page generation
  limit, so objects written under an earlier policy stay removable.
- Padlet deletion is independent: `source_references` cascades, while the
  Knowledge document and its PDF remain.

Postgres is authoritative because Storage and Postgres are not one
transaction. A successful DB deletion with a failed object cleanup is reported
as `storageCleanup: "partial"`; the failure remains observable for a future
retry/garbage-collection feature.

## Batched removal (P6J-F9-A1a)

Because a single document can contribute a couple of hundred deterministic
paths, cleanup removes them through `removeMany` in batches of at most
`KNOWLEDGE_STORAGE_REMOVAL_BATCH_SIZE` (100) rather than one request per
object. Batching happens *after* path capture and deduplication, so which
paths are attempted, and in what order, is unchanged — only the transport is.

- Most attempted paths are expected to be absent: page derivatives are
  optional, so removing an object that was never written must be harmless.
  `knowledgeDeletion.integration.test.ts` proves that against a local Supabase
  Storage instance; it is not assumed.
- A batch-level Storage error marks **every** path in that batch failed.
  Storage cannot distinguish an absent object from an undeleted one, so
  per-path outcomes are not inferable from the response — and reporting
  success that did not happen is the worse failure. Later batches still run.
- Single-path `remove` remains for ingestion compensation, which deletes
  exactly the one object it just uploaded.
- Still no Storage listing: paths are derived, never discovered.

## Future private PDF viewing

The eventual read flow is server authorization by board, followed by a
short-lived signed Storage URL returned to the browser. No browser Storage
policy, public bucket, public URL, or signed-URL endpoint is introduced here.
