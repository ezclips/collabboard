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

## Future private PDF viewing

The eventual read flow is server authorization by board, followed by a
short-lived signed Storage URL returned to the browser. No browser Storage
policy, public bucket, public URL, or signed-URL endpoint is introduced here.
