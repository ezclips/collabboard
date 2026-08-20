# CollabBoard Knowledge PDF worker

This is a one-shot, isolated worker operation. It processes exactly one
`knowledge_documents.id` and does not poll, schedule, enqueue, or dispatch
jobs.

```text
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=...
OPENDATALOADER_JAVA_BIN=C:\\runtime\\jdk-11\\bin\\java.exe
OPENDATALOADER_JAR_PATH=C:\\runtime\\opendataloader-pdf-2.5.0.jar
OPENDATALOADER_TIMEOUT_MS=120000
```

Invoke it with the repository’s existing isolated TypeScript runner:

```text
vite-node workers/knowledge-pdf/cli.ts <knowledge-document-id>
```

The long-running database-discovery dispatcher is separate:

```text
KNOWLEDGE_PDF_WORKER_CONCURRENCY=2
KNOWLEDGE_PDF_POLL_INTERVAL_MS=5000
vite-node workers/knowledge-pdf/runDispatcher.ts
```

It selects only `uploaded` and database-time expired `processing` rows. Failed
rows are intentionally excluded from automatic retry. Discovery does not claim
ownership; the P5C lease claim remains authoritative, so multiple dispatcher
processes are safe.

The worker pins OpenDataLoader PDF CLI `2.5.0`, invokes Java with an argument
array and `shell: false`, uses deterministic native/local options, and never
downloads or upgrades runtime artifacts. Java and the JAR are deployment
inputs; neither is committed here.

The sequence is:

```text
claim -> private download -> SHA-256 check -> PDF.js geometry
-> OpenDataLoader JSON -> P1 normalization -> raw artifact upload
-> transactional processing/ready completion
```

Parser artifacts are attempt-scoped:

```text
knowledge/{boardId}/{documentId}/extraction/attempt-{attempt}-{leaseToken}/opendataloader-2.5.0.json
```

This prevents an expired worker from overwriting a newer attempt’s artifact.

Failures use P5A’s sanitized `processing -> failed` transition. A successful
raw upload is removed if completion fails. A deleted document is reported as a
stale job. Temporary files are always removed.

P5A has no lease or heartbeat. A hard worker/process/host crash after claim
can therefore strand a document in `processing`; P5C adds database-time lease
recovery, token fencing, and an in-job heartbeat, but a hard crash after raw
artifact upload can still leave an unreachable attempt artifact. Production
dispatch remains blocked until later maintenance/recovery work addresses that
cross-system orphan case.

Geometry invariant: `knowledge_pages.width_points` and `height_points` are
canonical source-page dimensions from PDF.js at rotation `0`, while
`rotation` is stored separately as `0`, `90`, `180`, or `270`. OpenDataLoader
bboxes remain in `pdf-points-bottom-left` source coordinates.
