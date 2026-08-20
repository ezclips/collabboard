# Knowledge/PDF data foundation

The Knowledge/PDF foundation is board-scoped and parser-neutral.

## Persistence boundary

- `knowledge_documents` is the authoritative source identity and lifecycle.
- The original PDF is stored in Supabase Storage; `storage_path` is only its
  object key.
- `knowledge_pages` and `knowledge_chunks` are derived rows and cascade from
  their document.
- `source_references` cascade when either the source document or target Padlet
  is deleted. Deleting a target Padlet never deletes the source document.
- Raw parser output belongs in a later Supabase Storage artifact referenced by
  `raw_artifact_path`, not in hot relational rows.
- `knowledge_elements` and pgvector are intentionally absent from V1.

## Access and worker writes

Knowledge RLS derives from the existing board owner/
`board_collaborators` access model. There is no Knowledge membership table.
Readers can select board-visible documents, pages, chunks, and references;
editor-level board users can mutate them.

The future extraction worker must use the existing server-only Supabase client
with `SUPABASE_SERVICE_ROLE_KEY`, from a dedicated server/container process.
The service role bypasses RLS; the worker must validate the document/board job
before writing and must never expose that credential to browser code. This
patch adds no worker credentials, queue, or worker implementation.

## Reprocessing invariant

Pages and chunks may be replaced for the same document identity only when the
source content hash is unchanged. A changed PDF hash represents a new source
identity for citation purposes; old derived rows and references must not be
silently reused for the new binary. Storage cleanup for old raw artifacts is a
future worker responsibility.

Page geometry is nullable because OpenDataLoader does not provide reliable
page width, height, or rotation. A future worker enriches those fields from
PDF inspection before marking citations region-ready.
