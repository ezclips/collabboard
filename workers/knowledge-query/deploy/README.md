# Hosted knowledge-query service deployment preparation (P6I-H1)

This directory prepares, but does not deploy, a reproducible definition of the
already-live `collabboard-knowledge-query` Cloud Run service. It performs no
Google Cloud operation, image build/push, secret access, or IAM change. P6I-H1
is reproducibility hardening for an existing proven service, not a new
feature: it must not change hosted runtime behavior.

## Service identity

| Field | Value |
| --- | --- |
| Project | `callabboard` |
| Region | `europe-west6` |
| Service | `collabboard-knowledge-query` |
| Service account | `collabboard-query-service@callabboard.iam.gserviceaccount.com` |

## Locked runtime

Two containers in one revision:

| Container | Image | Resources | Role |
| --- | --- | --- | --- |
| `query-service` | `knowledge-query@sha256:<digest>` | 1 CPU, 512Mi | HTTP query API |
| `voyage-tei` | `knowledge-embedding-tei@sha256:<digest>` | 2 CPU, 6Gi | Local Voyage-4-nano TEI |

`query-service` listens on container port **8081**, named `http1`. Port 8081
(not 8080) is deliberate: the TEI sidecar owns loopback port 8080, and the
query container reaches it only through `KNOWLEDGE_EMBEDDING_TEI_URL=
http://127.0.0.1:8080`. `run.googleapis.com/container-dependencies` starts
`voyage-tei` before `query-service`.

Concurrency 8, `minScale` 0, `maxScale` 1, request timeout 180s,
`run.googleapis.com/ingress: all`.

### Startup probes -- two different policies

- **`voyage-tei` has an explicit, committed probe**: `GET /health` on port
  8080, `periodSeconds: 5`, `timeoutSeconds: 3`, `failureThreshold: 36` (the
  same 180-second cold-start allowance as the embedding Worker Pool).
- **`query-service` has NO committed probe.** The live export's TCP probe on
  8081 (`failureThreshold: 1`, `periodSeconds: 240`, `timeoutSeconds: 240`) is
  Cloud Run's generated default for a container with a declared port and no
  user probe -- proven by the sibling label `run.googleapis.com/
  startupProbeType: Default` in the same export. Committing it would pin a
  platform default as if it were an invariant; `deploy.ps1` omits it and lets
  Cloud Run regenerate it, and postdeploy verification confirms the
  regenerated form is `tcpSocket` on 8081.

### Startup CPU boost

`run.googleapis.com/startup-cpu-boost: 'true'` IS a committed, user-owned
invariant. With `minScale: 0` and a TEI sidecar that needs up to 180s to warm,
silently losing this on a future deploy would be a real cold-start
regression, not a harmless omission -- so it is pinned and re-verified.

### Scaling: two different annotations, one authoritative value

The live export contains both a **service-level**
`run.googleapis.com/maxScale: '6'` and a **revision-template**
`autoscaling.knative.dev/maxScale: '1'`. The revision template governs the
running revision; the service-level annotation is not consulted for the
active revision's ceiling. Only `autoscaling.knative.dev/{minScale,maxScale}`
are committed. See `H1_SERVICE_MAXSCALE_6_UNEXPLAINED` below.

### Ingress vs. IAM -- a hard boundary

`run.googleapis.com/ingress: all` is part of the Service spec and IS
committed/reproduced by `replace`. Cloud Run IAM (`roles/run.invoker =>
allUsers`) is a *separate* resource, never expressed in a Service spec and
never touched by `gcloud run services replace`. `deploy.ps1` contains no
`add-iam-policy-binding`, `set-iam-policy`, `--allow-unauthenticated`, or
`--no-allow-unauthenticated`. The runtime-proven application-layer bearer
+ board authorization boundary is unaffected by this package.

## Operator inputs

All non-secret inputs live in `production.env.example` -- copy it into a
protected operator environment and fill in both image digests. Secret
*values* never appear anywhere in this package; only Secret Manager names and
pinned integer versions do:

| Secret | Name | Current version |
| --- | --- | --- |
| `SUPABASE_URL` | `collabboard-supabase-url` | 2 |
| `SUPABASE_ANON_KEY` | `collabboard-supabase-anon-key` | 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | `collabboard-supabase-service-role-key` | 3 |

Secret names are pinned by `predeploy.mjs`; versions are operator inputs that
must be positive integers (`latest` is rejected) so a rotation is a deliberate
choice, not silent drift.

## Immutable images

`predeploy.mjs` requires both `QUERY_IMAGE_DIGEST` and `TEI_IMAGE_DIGEST` to
match `sha256:<64 lowercase hex characters>`. A tag (e.g. the live image's
provenance tag `c3c-79f9a1c`) is never an acceptable deploy reference. This
package never builds or pushes an image; both digests must already exist in
Artifact Registry before predeploy is run.

## Managed fields (never committed)

The live export contains several fields Cloud Run generates or mirrors on
every read. None of these appear in the generated spec:
`run.googleapis.com/ingress-status`, `run.googleapis.com/urls`,
`cloud.googleapis.com/location`, `run.googleapis.com/satisfiesPzs`,
`run.googleapis.com/client-name`, `run.googleapis.com/client-version`,
`client.knative.dev/nonce`, `run.googleapis.com/startupProbeType`,
`spec.template.metadata.name` (Cloud Run must generate the revision name),
and `run.googleapis.com/secrets` (regenerated from each container's
`secretKeyRef`). The numeric project number visible throughout the live
export's `namespace` field and generated URLs is never hardcoded anywhere in
this package -- only the project ID `callabboard` is used.

## Pre-state: rollback artifact AND spec-generation input

Before the one Cloud Run mutation, `deploy.ps1` captures the live service
twice and aborts immediately if either capture fails:

- `--format export` to a timestamped local YAML (the human-readable rollback
  artifact, kept on disk after the run -- never deleted by this script);
- `--format json` to a sibling JSON file, parsed to read
  `status.latestReadyRevisionName` (the rollback target) and every
  pre-existing `status.traffic` entry that carries a `tag`.

## Traffic strategy -- `H1_TRAFFIC_SEMANTIC_DELTA`

The live export pins 100% of traffic to a named revision
(`collabboard-knowledge-query-00008-zg8`). A reusable, committed template
cannot hardcode a revision that will not exist on the next deploy, so the
generated spec instead routes `{percent: 100, latestRevision: true}`. This is
an intentional, PM-acknowledged semantic change: traffic now *follows* the
newest healthy revision rather than pinning a specific one. The observable
effect for callers is identical (100% of traffic reaches the current
revision); what changes is that the *next* deployment no longer requires a
second traffic command. Every pre-existing tag (e.g. `c3c`) is re-emitted from
the captured pre-state with its *original* `revisionName` -- the deploy script
never moves an existing tag onto the new revision and never invents one. The
literal tag name `c3c` and the literal current revision name are not
hardcoded anywhere in this package.

## Deployment mechanism

`gcloud run services replace <generated-spec>` -- one mutation. Rejected:
`gcloud run deploy` (its `--allow-unauthenticated` / `--no-allow-unauthenticated`
switches mutate IAM as a side effect); `gcloud run services update`
(cannot express per-container secret refs, the startup probe, and the
container-dependency annotation coherently in one command).

## Required future authorized sequence

1. `node predeploy.mjs` (fails closed on any drift).
2. Capture pre-state (YAML + JSON); abort if either fails.
3. Record the prior ready revision.
4. Read pre-existing traffic tags from the JSON pre-state.
5. Generate a temporary spec (removed in a `finally` block after use; the
   pre-state files are not removed).
6. `gcloud run services replace <temp-spec>` -- the only mutation.
7. Read-only postdeploy verification (below).

`deploy.ps1` is committed but MUST NOT be executed against GCP as part of
this package's implementation; running it is a separately authorized operator
action.

## Postdeploy verification (read-only, credential-free)

After a future authorized run, `deploy.ps1` confirms: the service exists; a
new ready revision was created and differs from the prior one; 100% traffic
routes to it; every pre-existing tag is still present with its original
revision; query and TEI image digests match; service account, resources
(1 CPU/512Mi and 2 CPU/6Gi), query port/name (8081/`http1`), the container
dependency, and the TEI probe (36/5s/3s) are unchanged; the query probe
regenerated as `tcpSocket:8081`; startup CPU boost is `'true'`; effective
scaling is min 0/max 1; concurrency 8; timeout 180s; ingress `all`; and a
plain, unauthenticated `GET <serviceUrl>/health` returns 200. No bearer token
is ever obtained or handled, and no authenticated semantic query runs as part
of deployment or verification.

## Rollback

Primary (traffic-only, fastest, non-destructive):

```text
gcloud run services update-traffic collabboard-knowledge-query \
  --to-revisions=<priorRevision>=100 --project callabboard --region europe-west6
```

Secondary (full spec restore): `gcloud run services replace <pre-change YAML>`.
No database rollback, no secret rollback (this package never changes a secret
reference), no service deletion.

## Accepted notes -- not solved by H1

- **`H1_SERVICE_MAXSCALE_6_UNEXPLAINED`** -- the live service-level
  `run.googleapis.com/maxScale: '6'` annotation has no clear provenance and is
  inert with respect to the running revision (see Scaling above). Documented,
  not repaired.
- **`H1_TAG_FREEZE_NOTE`** -- carrying `c3c` forward unchanged is correct for
  H1 (no behavior change), but the tag will point at an increasingly old
  revision across future deploys. Whether it should track releases is a
  separate PM decision.
- **`H1_SINGLE_ENVIRONMENT_PACKAGE_DEBT`** -- project/region/service are
  pinned to exactly this one live environment; a future staging deployment
  would need parameterization.
- **`H1_EMBEDDING_PACKAGE_DIVERGENCE_DEBT`** -- after H1, this package has
  automatic pre-state capture and postdeploy verification that
  `workers/knowledge-pdf/deploy` and `workers/knowledge-embedding/deploy` do
  not. Back-porting is out of scope here.

Out of scope entirely: public ingress / IAM redesign, the per-instance rate
limiter, the missing vector index, embedding cutoff drift, cold-start
degradation, and the pre-existing fixture derivative gap.
