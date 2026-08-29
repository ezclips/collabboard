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

`query-service` listens on container port **8081**, named `http1` -- the TEI
sidecar owns loopback port 8080, reached only via
`KNOWLEDGE_EMBEDDING_TEI_URL=http://127.0.0.1:8080`.
`run.googleapis.com/container-dependencies` starts `voyage-tei` first.
Concurrency 8, `minScale` 0, `maxScale` 1, timeout 180s, ingress `all`.

**Startup probes, two policies.** `voyage-tei` has an explicit, committed
probe (`GET /health` on 8080, 5s/3s/36 -- the same 180s allowance as the
embedding Worker Pool). `query-service` has NO committed probe: the live
export's TCP probe (`failureThreshold: 1`, 240s/240s) is Cloud Run's
generated default for a declared port with no user probe, proven by the
sibling `startupProbeType: Default` label. `deploy.ps1` omits it and lets
Cloud Run regenerate it as `tcpSocket:8081`, re-verified postdeploy.

**Startup CPU boost.** `run.googleapis.com/startup-cpu-boost: 'true'` is a
committed, user-owned invariant -- with `minScale: 0` and a TEI sidecar that
needs up to 180s to warm, silently losing it would be a real regression.

**Scaling.** The live export has both a service-level
`run.googleapis.com/maxScale: '6'` and a revision-template
`autoscaling.knative.dev/maxScale: '1'`; only the revision template governs
the running revision, so only `autoscaling.knative.dev/{minScale,maxScale}`
are committed. See `H1_SERVICE_MAXSCALE_6_UNEXPLAINED` below.

**Ingress vs. IAM.** `run.googleapis.com/ingress: all` is part of the spec
and is reproduced by `replace`. IAM (`roles/run.invoker => allUsers`) is a
separate resource never touched by it -- no `add-iam-policy-binding`,
`set-iam-policy`, or `--allow-unauthenticated` flags appear in `deploy.ps1`.

## Operator inputs

Non-secret inputs live in `production.env.example`; fill in both image
digests. Secret *values* never appear anywhere in this package -- only Secret
Manager names and pinned integer versions:

| Secret | Name | Current version |
| --- | --- | --- |
| `SUPABASE_URL` | `collabboard-supabase-url` | 2 |
| `SUPABASE_ANON_KEY` | `collabboard-supabase-anon-key` | 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | `collabboard-supabase-service-role-key` | 3 |

Secret names are pinned by `predeploy.mjs`; versions are operator inputs that
must be positive integers (`latest` rejected). Cloud Run v1 also requires an
explicit `run.googleapis.com/secrets` annotation naming each secret's full
resource path -- see "Secret location annotation" below.

## Immutable images

`predeploy.mjs` requires both digests to match `sha256:<64 lowercase hex>`. A
tag (e.g. the live image's provenance tag `c3c-79f9a1c`) is never acceptable.
This package never builds or pushes an image.

## Managed fields (never committed)

None of these appear in the generated spec: `ingress-status`, `urls`,
`cloud.googleapis.com/location`, `satisfiesPzs`, `client-name`,
`client-version`, `client.knative.dev/nonce`, `startupProbeType`,
`spec.template.metadata.name`, and `metadata.namespace` (the live namespace
equals the numeric project number; `--project=callabboard` resolves it
without spelling it out). That number is never hardcoded in this package's
source -- only the project ID `callabboard` is; the real number is read at
deploy time from pre-state.

## Secret location annotation -- sourced from pre-state, never hardcoded

Cloud Run v1 requires `run.googleapis.com/secrets` alongside per-container
`secretKeyRef` bindings; it is not regenerated from them. `deploy.ps1` reads
the existing annotation off captured pre-state JSON (already carrying the
real project number) and validates it before re-emitting it: each secret
alias must map to `projects/<digits>/secrets/<that alias>`, or the run
aborts before any mutation. Versions stay in `secretKeyRef.key`, from
`*_SECRET_VERSION` inputs. Postdeploy re-validates the live annotation and
each env var's `secretKeyRef.name`/`key`.

## StrictMode-safe traffic handling

`deploy.ps1` runs under `Set-StrictMode -Version Latest`. Traffic entries are
heterogeneous and optional fields must be read safely; an entry may carry a
serving percentage, a tag, or both -- so every optional property is read
through a `Get-Prop` helper that checks `PSObject.Properties` membership
first, rather than a bare `.tag`/`.percent` access that would throw
`PropertyNotFoundException` on a legitimately absent key. Tag/revision names
are validated against the RFC1035 label shape before being spliced into YAML;
duplicates abort. Tag and percent are validated independently, so a combined
entry gets both effects.

## Pre-state: rollback artifact AND spec-generation input

Before the one Cloud Run mutation, `deploy.ps1` captures the live service
twice and aborts immediately if either capture, write, or parse fails:
`--format export` to a timestamped local YAML (rollback artifact, kept on
disk, never deleted by this script), and `--format json`, parsed for
`status.latestReadyRevisionName`, every tagged `status.traffic` entry, and
the live secrets annotation.

## Traffic strategy -- `H1_TRAFFIC_SEMANTIC_DELTA`

The live export pins 100% of traffic to a named revision
(`collabboard-knowledge-query-00008-zg8`). A reusable template cannot
hardcode a revision that won't exist next deploy, so the generated spec
routes `{percent: 100, latestRevision: true}` instead -- a PM-acknowledged
semantic change: traffic now follows the newest healthy revision, not a
pinned one. Every pre-existing tag (e.g. `c3c`) is re-emitted with its
*original* `revisionName`, read from pre-state -- never moved, never
invented. Neither `c3c` nor the current revision name is hardcoded here.

## Deployment mechanism

`gcloud run services replace <generated-spec>` -- one mutation. Rejected:
`gcloud run deploy` (allow-unauthenticated switches mutate IAM); `gcloud run
services update` (can't express secret refs, probe, dependency together).

## Required future authorized sequence

1. `node predeploy.mjs` (fails closed on any drift).
2. Capture and validate pre-state (YAML + JSON); abort on any failure.
3. Record the prior ready revision, pre-existing tags, secrets annotation.
4. Generate a temporary spec (removed in `finally`; pre-state files kept).
5. `gcloud run services replace <temp-spec>` -- the only mutation.
6. Read-only postdeploy verification (below).

`deploy.ps1` is committed but MUST NOT be executed against GCP as part of
this package's implementation; running it is a separately authorized operator
action.

## Postdeploy verification (read-only, credential-free)

After a future authorized run, `deploy.ps1` confirms: the service exists; a
new ready revision differs from the prior one and gets 100% traffic; every
pre-existing tag still maps to its *original* revision (a tag silently
repointed to the new revision fails verification, not just a presence
check); images, service account, resources, query port/name, and the TEI
probe are unchanged; the dependency annotation parses as JSON and names
*exactly* `["voyage-tei"]` (not a substring match); the query probe
regenerated as `tcpSocket:8081`; boost, scaling, concurrency, timeout, and
ingress are unchanged; each container env var is bound to its expected
`secretKeyRef.name`/`key`; the live secrets annotation still validates; and
an unauthenticated `GET <serviceUrl>/health` returns 200. No bearer token or
secret value is ever obtained, printed, or handled.

## Rollback

Primary (traffic-only, fastest, non-destructive):

```text
gcloud run services update-traffic collabboard-knowledge-query \
  --to-revisions=<priorRevision>=100 --project callabboard --region europe-west6
```

`update-traffic` only reassigns percentage splits; tags are a separate
control (`--set-tags`/`--update-tags`) untouched by this command, so existing
tags are expected to survive a primary rollback unchanged.

Secondary (full spec restore): `gcloud run services replace <pre-change
YAML>`. No database rollback, no secret rollback, no service deletion.

## Accepted notes -- not solved by H1

- **`H1_SERVICE_MAXSCALE_6_UNEXPLAINED`** -- the live service-level `maxScale: '6'` annotation has no clear provenance and is inert (see Scaling above); documented, not repaired.
- **`H1_TAG_FREEZE_NOTE`** -- carrying `c3c` forward unchanged is correct for H1, but it will point at an increasingly old revision over time; tracking releases is a separate PM decision.
- **`H1_SINGLE_ENVIRONMENT_PACKAGE_DEBT`** -- pinned to this one live environment; staging would need parameterization.
- **`H1_EMBEDDING_PACKAGE_DIVERGENCE_DEBT`** -- this package now has automatic pre-state capture/postdeploy verification the pdf/embedding packages don't; back-porting is out of scope here.

Independent review fixes (all covered by executable PowerShell tests, not
source-text greps): unguarded optional-property access on traffic under
StrictMode; the secrets annotation was wrongly omitted; postdeploy tag check
verified presence, not original mapping; dependency check was substring-only.
Pre-state/spec files now write UTF-8 without BOM (`WriteAllText` +
`UTF8Encoding($false)`), not PS 5.1's BOM-emitting `-Encoding utf8`.

Out of scope entirely: public ingress / IAM redesign, the per-instance rate
limiter, the missing vector index, embedding cutoff drift, cold-start
degradation, and the pre-existing fixture derivative gap.
