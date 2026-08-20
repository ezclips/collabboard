# Knowledge PDF storage lifecycle

Knowledge source PDFs live in the private `knowledge-documents` bucket at:

```text
knowledge/{boardId}/{documentId}/original.pdf
```

The original filename is metadata only. `raw_artifact_path` is an optional
second artifact path and is deleted with the original when present.

## Deletion boundaries

- Dashboard trash (`app/dashboard/page.tsx`) is a soft-delete update to
  `boards.deleted_at`; it intentionally does not delete Knowledge rows or
  binaries so a trashed board can remain recoverable.
- Physical board deletion is the server-only `DELETE /api/boards/[id]` path.
  It authenticates first, authorizes the board owner, captures every document
  artifact path, deletes the board so Postgres cascades its Knowledge rows,
  then removes the captured Storage objects.
- `deleteKnowledgeDocument` uses the same post-DB artifact cleanup helper.
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
