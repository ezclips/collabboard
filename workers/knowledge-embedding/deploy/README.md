# Local Voyage embedding Worker Pool preparation

This directory prepares, but does not deploy, the P6I local semantic
embedding Worker Pool. It performs no Google Cloud operation, image push,
secret access, IAM change, production Supabase access, or hosted inference.

## Locked runtime

The Node embedding worker remains the orchestrator. The Worker Pool revision
contains two containers in one instance:

| Container | Image | Resources | Role |
| --- | --- | --- | --- |
| `knowledge-worker` | `knowledge-embedding-worker@sha256:<digest>` | 1 CPU, 1Gi | Node polling and persistence |
| `voyage-tei` | `knowledge-embedding-tei@sha256:<digest>` | 2 CPU, 3Gi | Local Voyage-4-nano TEI |

The TEI sidecar is reached only through `http://127.0.0.1:8080`. It is not a
public service. Cloud Run container dependencies start `voyage-tei` first;
the Node container depends on it. The TEI startup probe is `GET /health` with
36 five-second attempts, allowing 180 seconds for the measured cold start.

The Worker Pool is deliberately prepared with manual `instances=0`. Creating
or scaling an instance requires a separate explicit operator action. The
deployment script never changes this safe default to 1.

## Immutable TEI image

`tei/Dockerfile` is a multi-stage build. The final image is based on the exact
upstream TEI digest:

```text
ghcr.io/huggingface/text-embeddings-inference@sha256:ad950d30878eceb72aaf32024d26fa2b1d04a75304fa0b4776b49aa1941fea07
```

The build downloads the public `voyageai/voyage-4-nano` snapshot at revision
`67fabc9bef010dabc5f6024aa1b1b6b93410426f` into `/model`. The final command
passes `/model` to TEI, so runtime startup does not fetch model files from
Hugging Face. Offline environment flags are set as a defense in depth; they
are not an egress-isolation claim.

The fixed TEI command is:

```text
--model-id /model --port 8080
--max-batch-tokens 4096
--max-concurrent-requests 8
--max-client-batch-size 8
--tokenization-workers 2
```

Automatic global truncation is not disabled. The Node provider continues to
send `truncate=false` for each small document request.

## Local provider configuration

The prepared Node container uses:

```text
KNOWLEDGE_EMBEDDING_PROVIDER=local-tei
KNOWLEDGE_EMBEDDING_TEI_URL=http://127.0.0.1:8080
KNOWLEDGE_EMBEDDING_MODEL=voyageai/voyage-4-nano
KNOWLEDGE_EMBEDDING_MODEL_ID=local:voyage-4-nano
KNOWLEDGE_EMBEDDING_DIMENSIONS=1024
KNOWLEDGE_EMBEDDING_CREATED_AFTER=2026-08-21T22:06:19Z
```

Only the existing Supabase URL and service-role secret references are mounted
into the local Node container. No OpenAI secret is required or included in
this deployment path. The existing OpenAI provider remains dormant runtime
compatibility in the worker code and is not selected by this preparation.

## Predeploy and deployment preparation

Copy `production.env.example` into a protected operator environment and
replace both image-digest placeholders. Then run:

```text
node workers/knowledge-embedding/deploy/predeploy.mjs
```

The validator is local and side-effect free. It requires both immutable
Artifact Registry image digests, the exact local profile, loopback TEI URL,
the exact production cutoff, pinned Supabase secret versions, and the safe
zero-instance setting. It never prints secret values.

The separately authorized deployment command is:

```powershell
.\workers\knowledge-embedding\deploy\deploy.ps1
```

It generates a temporary Worker Pool YAML specification, uses the supported
Cloud Run Worker Pool sidecar/dependency/startup-probe configuration, invokes
`gcloud run worker-pools replace`, and removes the temporary file. This patch
does not run it.

## Cutoff and rollback

The exact production cutoff is `2026-08-21T22:06:19Z`; the historical EMG
document remains excluded. No backfill is part of this preparation.

To disable a separately deployed pool, an explicitly authorized operator can
run:

```text
gcloud run worker-pools update collabboard-knowledge-embedding-worker --instances=0
```

Do not delete P6I tables, rewrite extraction state, or mutate Knowledge rows
as a rollback action.
