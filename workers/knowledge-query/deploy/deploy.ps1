$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$deployDirectory = $PSScriptRoot
& node (Join-Path $deployDirectory 'predeploy.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Deployment preflight failed' }

function Required-Environment([string] $Name) {
    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($value)) { throw ($Name + ' is required') }
    return $value.Trim()
}

$projectId = Required-Environment 'GCP_PROJECT_ID'
$region = Required-Environment 'GCP_REGION'
$serviceName = Required-Environment 'SERVICE_NAME'
$serviceAccount = Required-Environment 'SERVICE_ACCOUNT_EMAIL'
$queryDigest = Required-Environment 'QUERY_IMAGE_DIGEST'
$teiDigest = Required-Environment 'TEI_IMAGE_DIGEST'
$queryCpu = Required-Environment 'QUERY_CPU'
$queryMemory = Required-Environment 'QUERY_MEMORY'
$teiCpu = Required-Environment 'TEI_CPU'
$teiMemory = Required-Environment 'TEI_MEMORY'
$queryPort = Required-Environment 'QUERY_PORT'
$teiUrl = Required-Environment 'KNOWLEDGE_EMBEDDING_TEI_URL'
$concurrency = Required-Environment 'CONTAINER_CONCURRENCY'
$minScale = Required-Environment 'AUTOSCALING_MIN_SCALE'
$maxScale = Required-Environment 'AUTOSCALING_MAX_SCALE'
$timeoutSeconds = Required-Environment 'REQUEST_TIMEOUT_SECONDS'
$ingress = Required-Environment 'INGRESS'
$urlSecretName = Required-Environment 'SUPABASE_URL_SECRET_NAME'
$urlSecretVersion = Required-Environment 'SUPABASE_URL_SECRET_VERSION'
$anonSecretName = Required-Environment 'SUPABASE_ANON_KEY_SECRET_NAME'
$anonSecretVersion = Required-Environment 'SUPABASE_ANON_KEY_SECRET_VERSION'
$serviceRoleSecretName = Required-Environment 'SUPABASE_SERVICE_ROLE_KEY_SECRET_NAME'
$serviceRoleSecretVersion = Required-Environment 'SUPABASE_SERVICE_ROLE_KEY_SECRET_VERSION'

$queryImage = 'europe-west6-docker.pkg.dev/' + $projectId + '/collabboard-workers/knowledge-query@' + $queryDigest
$teiImage = 'europe-west6-docker.pkg.dev/' + $projectId + '/collabboard-workers/knowledge-embedding-tei@' + $teiDigest

$timestamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$preStateYamlPath = Join-Path (Get-Location) ('collabboard-knowledge-query-prechange-' + $timestamp + '.yaml')
$preStateJsonPath = Join-Path (Get-Location) ('collabboard-knowledge-query-prechange-' + $timestamp + '.json')

# Pre-state MUST be captured before any mutation: it is both the rollback
# artifact and the source of truth for the traffic-tag preservation below.
& gcloud run services describe $serviceName --project $projectId --region $region --format export | Out-File -LiteralPath $preStateYamlPath -Encoding utf8
if ($LASTEXITCODE -ne 0) { throw 'Pre-state YAML capture failed; aborting before any mutation' }
& gcloud run services describe $serviceName --project $projectId --region $region --format json | Out-File -LiteralPath $preStateJsonPath -Encoding utf8
if ($LASTEXITCODE -ne 0) { throw 'Pre-state JSON capture failed; aborting before any mutation' }

$preState = Get-Content -LiteralPath $preStateJsonPath -Raw | ConvertFrom-Json
$priorRevision = $preState.status.latestReadyRevisionName
if ([string]::IsNullOrWhiteSpace($priorRevision)) { throw 'Could not determine prior ready revision from pre-state' }
Write-Host ('Prior ready revision (rollback target if unhealthy): ' + $priorRevision)

# Preserve every pre-existing tag exactly as captured. Never move a tag onto
# the new revision and never invent one; only reproduce what already exists.
$tagEntries = @()
foreach ($entry in $preState.status.traffic) {
    if ($null -ne $entry.tag -and -not [string]::IsNullOrWhiteSpace($entry.tag)) {
        $tagEntries += [PSCustomObject]@{ Tag = $entry.tag; RevisionName = $entry.revisionName }
    }
}
$tagBlockLines = @()
foreach ($tagEntry in $tagEntries) {
    $tagBlockLines += ('  - tag: ' + $tagEntry.Tag)
    $tagBlockLines += ('    revisionName: ' + $tagEntry.RevisionName)
}
$tagBlock = $tagBlockLines -join "`n"

$spec = @"
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: $serviceName
  annotations:
    run.googleapis.com/ingress: $ingress
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: '$minScale'
        autoscaling.knative.dev/maxScale: '$maxScale'
        run.googleapis.com/container-dependencies: '{"query-service":["voyage-tei"]}'
        run.googleapis.com/startup-cpu-boost: 'true'
    spec:
      serviceAccountName: $serviceAccount
      containerConcurrency: $concurrency
      timeoutSeconds: $timeoutSeconds
      containers:
      - name: query-service
        image: $queryImage
        ports:
        - name: http1
          containerPort: $queryPort
        resources:
          limits:
            cpu: "$queryCpu"
            memory: "$queryMemory"
        env:
        - name: KNOWLEDGE_EMBEDDING_TEI_URL
          value: "$teiUrl"
        - name: SUPABASE_URL
          valueFrom:
            secretKeyRef:
              name: "$urlSecretName"
              key: "$urlSecretVersion"
        - name: SUPABASE_ANON_KEY
          valueFrom:
            secretKeyRef:
              name: "$anonSecretName"
              key: "$anonSecretVersion"
        - name: SUPABASE_SERVICE_ROLE_KEY
          valueFrom:
            secretKeyRef:
              name: "$serviceRoleSecretName"
              key: "$serviceRoleSecretVersion"
      - name: voyage-tei
        image: $teiImage
        resources:
          limits:
            cpu: "$teiCpu"
            memory: "$teiMemory"
        startupProbe:
          httpGet:
            path: /health
            port: 8080
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 36
  traffic:
  - percent: 100
    latestRevision: true
$tagBlock
"@

$specPath = Join-Path ([IO.Path]::GetTempPath()) ('collabboard-knowledge-query-' + [Guid]::NewGuid().ToString('N') + '.yaml')
try {
    Set-Content -LiteralPath $specPath -Value $spec -Encoding utf8 -NoNewline
    Write-Host ('Replacing Cloud Run service ' + $serviceName + ' -- query=' + $queryImage + ' tei=' + $teiImage)
    Write-Host 'Traffic: 100% to latestRevision; pre-existing tags preserved from captured pre-state.'
    & gcloud run services replace $specPath --project $projectId --region $region
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    if (Test-Path -LiteralPath $specPath) { Remove-Item -LiteralPath $specPath -Force }
}

# ---- Read-only postdeploy verification: describe + unauthenticated /health only ----
$postState = & gcloud run services describe $serviceName --project $projectId --region $region --format json | ConvertFrom-Json
$newRevision = $postState.status.latestReadyRevisionName
if ([string]::IsNullOrWhiteSpace($newRevision) -or $newRevision -eq $priorRevision) { throw 'Postdeploy verification failed: no new ready revision' }

$traffic100 = $postState.status.traffic | Where-Object { $_.percent -eq 100 }
if ($null -eq $traffic100 -or $traffic100.revisionName -ne $newRevision) { throw 'Postdeploy verification failed: 100% traffic not on new revision' }
foreach ($tagEntry in $tagEntries) {
    $stillPresent = $postState.status.traffic | Where-Object { $_.tag -eq $tagEntry.Tag }
    if ($null -eq $stillPresent) { throw ('Postdeploy verification failed: tag ' + $tagEntry.Tag + ' missing after deploy') }
}

$newContainers = $postState.spec.template.spec.containers
$queryContainer = $newContainers | Where-Object { $_.name -eq 'query-service' }
$teiContainer = $newContainers | Where-Object { $_.name -eq 'voyage-tei' }
if ($queryContainer.image -ne $queryImage) { throw 'Postdeploy verification failed: query image mismatch' }
if ($teiContainer.image -ne $teiImage) { throw 'Postdeploy verification failed: TEI image mismatch' }
if ($postState.spec.template.spec.serviceAccountName -ne $serviceAccount) { throw 'Postdeploy verification failed: service account mismatch' }
if ($queryContainer.resources.limits.cpu -ne $queryCpu -or $queryContainer.resources.limits.memory -ne $queryMemory) { throw 'Postdeploy verification failed: query resources mismatch' }
if ($teiContainer.resources.limits.cpu -ne $teiCpu -or $teiContainer.resources.limits.memory -ne $teiMemory) { throw 'Postdeploy verification failed: TEI resources mismatch' }
if ($queryContainer.ports[0].containerPort -ne [int]$queryPort -or $queryContainer.ports[0].name -ne 'http1') { throw 'Postdeploy verification failed: query port mismatch' }
$dependencyAnnotation = $postState.spec.template.metadata.annotations.'run.googleapis.com/container-dependencies'
if ($dependencyAnnotation -notmatch 'voyage-tei') { throw 'Postdeploy verification failed: container dependency missing' }
$teiProbe = $teiContainer.startupProbe
if ($teiProbe.httpGet.path -ne '/health' -or $teiProbe.httpGet.port -ne 8080 -or $teiProbe.failureThreshold -ne 36 -or $teiProbe.periodSeconds -ne 5 -or $teiProbe.timeoutSeconds -ne 3) { throw 'Postdeploy verification failed: TEI startup probe mismatch' }
$queryProbe = $queryContainer.startupProbe
if ($null -eq $queryProbe.tcpSocket -or $queryProbe.tcpSocket.port -ne [int]$queryPort) { throw 'Postdeploy verification failed: query startup probe is not the expected regenerated TCP default' }
$boostAnnotation = $postState.spec.template.metadata.annotations.'run.googleapis.com/startup-cpu-boost'
if ($boostAnnotation -ne 'true') { throw 'Postdeploy verification failed: startup CPU boost missing' }
$minAnnotation = $postState.spec.template.metadata.annotations.'autoscaling.knative.dev/minScale'
$maxAnnotation = $postState.spec.template.metadata.annotations.'autoscaling.knative.dev/maxScale'
if ($minAnnotation -ne $minScale -or $maxAnnotation -ne $maxScale) { throw 'Postdeploy verification failed: scaling mismatch' }
if ($postState.spec.template.spec.containerConcurrency -ne [int]$concurrency) { throw 'Postdeploy verification failed: concurrency mismatch' }
if ($postState.spec.template.spec.timeoutSeconds -ne [int]$timeoutSeconds) { throw 'Postdeploy verification failed: timeout mismatch' }
if ($postState.metadata.annotations.'run.googleapis.com/ingress' -ne $ingress) { throw 'Postdeploy verification failed: ingress mismatch' }

$serviceUrl = $postState.status.url
$health = Invoke-WebRequest -Uri ($serviceUrl + '/health') -Method Get -UseBasicParsing
if ($health.StatusCode -ne 200) { throw 'Postdeploy verification failed: /health did not return 200' }

Write-Host 'Postdeploy verification passed. Rollback artifacts retained on disk:'
Write-Host ('  ' + $preStateYamlPath)
Write-Host ('  ' + $preStateJsonPath)
Write-Host ('Primary rollback: gcloud run services update-traffic ' + $serviceName + ' --to-revisions=' + $priorRevision + '=100 --project ' + $projectId + ' --region ' + $region)
