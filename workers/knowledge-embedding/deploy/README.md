# Semantic embedding worker deployment preparation

P6I-B prepares a separate Cloud Run Worker Pool package. It deploys nothing,
builds or pushes no image, creates no Google Cloud resource, reads or creates
no secret, calls no OpenAI endpoint, and does not connect to production
Supabase. Run `predeploy.mjs` locally with placeholders before any separately
authorized deployment.

## Production target

| Setting | Value |
| --- | --- |
| Project | `callabboard` |
| Region | `europe-west6` |
| Worker Pool | `collabboard-knowledge-embedding-worker` |
| Artifact Registry repository/image | `collabboard-workers/knowledge-embedding-worker` |
| Instances | `1` |
| CPU | `1` |
| Memory | `1Gi` |

The immutable deployment image is:

```text
europe-west6-docker.pkg.dev/callabboard/collabboard-workers/knowledge-embedding-worker@sha256:<64-hex-digest>
```

Never deploy `latest`, a mutable tag, or the PDF worker image/pool. The
embedding worker has no JVM, OpenDataLoader, PDF.js, HTTP server, port, or
health endpoint. Its exec-form command is a direct Node process so SIGTERM and
SIGINT reach the worker.

## Approved profile and cutoff

The initial profile is `text-embedding-3-small`, 1536 dimensions, with
`model_id=openai:text-embedding-3-small`. `KNOWLEDGE_EMBEDDING_CREATED_AFTER`
is mandatory and must be set to the production enable timestamp. It has no
default: omitting it is a predeploy failure. This prevents pre-existing Ready
documents from becoming eligible implicitly. Backfill requires separate
authorization and an explicitly chosen earlier cutoff.

## Secrets and identity

Use a separate least-privilege service account, for example
`collabboard-embed-worker@callabboard.iam.gserviceaccount.com`.
Do not reuse the PDF worker identity. The deployment passes only pinned Secret
Manager references for `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and
`OPENAI_API_KEY`; values never belong in this repository, image arguments,
logs, or metadata. Each secret has its own required positive version.

Required secret inputs are:

- `SUPABASE_URL_SECRET_NAME` / `SUPABASE_URL_SECRET_VERSION`
- `SUPABASE_SERVICE_ROLE_KEY_SECRET_NAME` / `SUPABASE_SERVICE_ROLE_KEY_SECRET_VERSION`
- `OPENAI_API_KEY_SECRET_NAME` / `OPENAI_API_KEY_SECRET_VERSION`

## Local preparation

Set the inputs from `production.env.example` in a protected operator shell,
including a real immutable image digest and explicit cutoff, then run:

```text
node workers/knowledge-embedding/deploy/predeploy.mjs
```

The validator is local and side-effect free. It prints configuration metadata,
secret names/versions, and the digest only; it never prints secret values.
The deployment command is documented by `deploy.ps1` but is not run by P6I-B.

## First controlled production test

After separate deployment and data-test authorization, use one new,
non-sensitive disposable PDF uploaded after the cutoff. Verify candidate
discovery, embedding persistence, retrieval, stale-hash behavior, and worker
health, then delete that test document through the normal lifecycle. Do not
use an existing private document for the smoke test.

## Rollback

Scale the worker pool to zero or restore the previous immutable revision/image.
Do not drop P6I tables or RPCs, rewrite PDF Ready state, or mutate extraction
leases. Embeddings are derived rows and cascade from their chunks.
