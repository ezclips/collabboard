# Cloud Run Worker Pool deployment preparation

This directory prepares the existing P5E Knowledge PDF worker for one
Google Cloud Run Worker Pool. It does not deploy anything, push an image,
create Google Cloud resources, create secrets, change IAM, or connect to
production Supabase.

The canonical method is deploy.ps1. It runs the safe local predeploy.mjs
validation and then prepares the following command:

~~~text
gcloud beta run worker-pools deploy collabboard-knowledge-pdf-worker
~~~

The container remains the existing P5E image. Its exec-form command is still:

~~~text
node /app/dist/runDispatcher.mjs
~~~

There is no HTTP server, port, health endpoint, Cloud Run Service, Cloud Run
Job, or shell signal wrapper.

## Initial production profile

| Setting | Initial value | Reason |
| --- | --- | --- |
| Worker Pool | collabboard-knowledge-pdf-worker | Stable production name |
| Region | Required GCP_REGION | Must be chosen near the production Supabase region |
| Instances | 1 | Manual starting point; no autoscaler |
| CPU | 2 vCPU | Conservative starting point for Node, Java, PDF.js, and parser work |
| Memory | 4Gi | Conservative starting point for two concurrent PDF jobs and temporary files |
| Dispatcher concurrency | 2 | Existing worker configuration |
| Poll interval | 5000 ms | Existing worker default |
| Discovery limit | 16 | Existing dispatcher default |
| Lease TTL | 300 seconds | Existing extraction default |
| Heartbeat | 100000 ms | Existing one-third lease default |
| OpenDataLoader timeout | 120000 ms | Existing parser default |

The CPU and memory values are intentionally initial sizing, not a final
capacity decision. Review Cloud Run CPU, memory, restart, and job-duration
metrics after controlled production use before changing them.

Cloud Run Worker Pools are a preview/beta product. Confirm that the selected
region and the project are supported before an authorized deployment.

## Artifact Registry image

The expected immutable image form is:

~~~text
GCP_REGION-docker.pkg.dev/GCP_PROJECT_ID/collabboard-workers/knowledge-pdf-worker@sha256:64-hex-digest
~~~

The repository and image must already exist before deployment. This patch does
not create collabboard-workers, build an image, or push an image. A readable
version tag may exist for humans, but deployment input is always IMAGE_DIGEST,
never latest.

## Required operator inputs

Copy production.env.example as a checklist and provide the values through the
operator shell or a protected CI configuration store:

- GCP_PROJECT_ID
- GCP_REGION
- IMAGE_DIGEST in the exact sha256:<64 hex characters> form
- SERVICE_ACCOUNT_EMAIL for the dedicated
  collabboard-knowledge-worker identity
- SUPABASE_URL_SECRET_NAME
- SUPABASE_SERVICE_ROLE_KEY_SECRET_NAME
- SUPABASE_SECRET_VERSION

The two Supabase secret names are references only. Their values must exist in
Google Secret Manager and must never appear in this repository, YAML,
PowerShell, build arguments, image metadata, or environment example files.

The worker service account needs Secret Manager Secret Accessor permission
only on these two secrets. The deployment identity separately needs the
Cloud Run deployment permission and Service Account User permission for the
worker identity. Do not grant the worker project Owner or Editor.

## Read-only production preflight

Before an eventual deployment, run the existing read-only verifier:

~~~text
supabase/production-rollouts/20260820_knowledge_pdf_v1_verify.sql
~~~

The result must confirm all four Knowledge tables, RLS, the private
knowledge-documents bucket, lease columns, five RPCs, and the exact RPC
privilege matrix:

~~~text
PUBLIC=false
anon=false
authenticated=false
service_role=true
~~~

This preflight is read-only. Do not use db push, --linked, the rollout SQL,
or any application write while validating deployment readiness.

## Safe local validation

With deployment inputs set, run:

~~~text
node workers/knowledge-pdf/deploy/predeploy.mjs
~~~

This checks formatting, digest immutability, resource values, worker-pool
name, service-account format, secret names, pinned secret version, and the
actual worker configuration. It performs no network calls and does not read
secret values.

Only after the operator has separately reviewed the production preflight,
Artifact Registry image, IAM, region, and secret access should the authorized
operator run:

~~~powershell
.\workers\knowledge-pdf\deploy\deploy.ps1
~~~

This patch does not run that command.

## Post-deployment smoke plan

Documented for a future authorized deployment; not executed by this patch:

1. Deploy exactly one worker-pool instance.
2. Confirm the revision is running and Cloud Run stdout/stderr is visible.
3. Confirm there is no knowledge-pdf-dispatcher-configuration-error.
4. Ingest one controlled small PDF through the normal CollabBoard flow.
5. Verify uploaded -> processing -> ready.
6. Verify page_count, parser version 2.5.0, positive geometry, and
   raw_artifact_path.
7. Confirm the original PDF and raw artifact are private.
8. Confirm processing_error is null and the lease fields are cleared.
9. Confirm no knowledge_chunks or RAG work has been introduced.

Existing structured logs are bounded and should be correlated by document ID.
Useful operational fields are document ID, attempt, stage, duration, and
status. Do not log PDF contents, parser JSON, Supabase keys, or JWTs.

The current process contract is graceful SIGTERM through the exec-form Node
command. Cloud Run revision state plus dispatcher/job logs are the health
signal; no HTTP health server is added.

## Rollback

Rollback is operational and does not reverse the database foundation:

~~~text
gcloud beta run worker-pools update collabboard-knowledge-pdf-worker --region GCP_REGION --instances=0
~~~

Then inspect lifecycle state and either restore the prior worker revision/image
or redeploy the previous immutable digest. Do not drop Knowledge tables, delete
Knowledge rows, rewrite processing state manually, or reverse the production
schema.
