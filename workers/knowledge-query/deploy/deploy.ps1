$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
function Get-Prop($obj, [string] $name) {
    if ($null -eq $obj) { return $null }
    $prop = $obj.PSObject.Properties[$name]
    if ($null -eq $prop) { return $null }
    return $prop.Value
}
function Test-SafeResourceName([string] $name) {
    return $name -match '^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$'
}
function Write-Utf8NoBom([string] $path, [string] $content) {
    [IO.File]::WriteAllText($path, $content, (New-Object Text.UTF8Encoding($false)))
}
function Test-SecretsAnnotation([string] $raw, [string[]] $expectedAliases) {
    $found = @{}
    foreach ($part in ($raw -split ',')) {
        $kv = $part -split ':', 2
        if ($kv.Count -ne 2) { throw ('Malformed secrets annotation entry: ' + $part) }
        $alias = $kv[0].Trim()
        $target = $kv[1].Trim()
        if ($target -notmatch ('^projects/\d+/secrets/' + [regex]::Escape($alias) + '$')) {
            throw ('Secrets annotation entry for "' + $alias + '" has an unexpected resource location')
        }
        $found[$alias] = $target
    }
    foreach ($expected in $expectedAliases) {
        if (-not $found.ContainsKey($expected)) { throw ('Secrets annotation is missing expected alias "' + $expected + '"') }
    }
    return $found
}
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
$expectedAliases = @($urlSecretName, $anonSecretName, $serviceRoleSecretName)
$queryImage = 'europe-west6-docker.pkg.dev/' + $projectId + '/collabboard-workers/knowledge-query@' + $queryDigest
$teiImage = 'europe-west6-docker.pkg.dev/' + $projectId + '/collabboard-workers/knowledge-embedding-tei@' + $teiDigest
$timestamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$preStateYamlPath = Join-Path (Get-Location) ('collabboard-knowledge-query-prechange-' + $timestamp + '.yaml')
$preStateJsonPath = Join-Path (Get-Location) ('collabboard-knowledge-query-prechange-' + $timestamp + '.json')
# Pre-state MUST be captured, validated, and written before any mutation: it is
# the rollback artifact and the sole source of truth for traffic/tag/secrets
# reconstruction below. Every step aborts closed on any capture/parse failure.
$yamlLines = & gcloud run services describe $serviceName --project $projectId --region $region --format export
if ($LASTEXITCODE -ne 0) { throw 'Pre-state YAML capture failed; aborting before any mutation' }
$yamlContent = ($yamlLines -join "`n")
if ([string]::IsNullOrWhiteSpace($yamlContent)) { throw 'Pre-state YAML capture returned empty output; aborting before any mutation' }
Write-Utf8NoBom $preStateYamlPath $yamlContent
if (-not (Test-Path -LiteralPath $preStateYamlPath)) { throw 'Pre-state YAML file missing after write; aborting before any mutation' }
$jsonLines = & gcloud run services describe $serviceName --project $projectId --region $region --format json
if ($LASTEXITCODE -ne 0) { throw 'Pre-state JSON capture failed; aborting before any mutation' }
$jsonContent = ($jsonLines -join "`n")
if ([string]::IsNullOrWhiteSpace($jsonContent)) { throw 'Pre-state JSON capture returned empty output; aborting before any mutation' }
Write-Utf8NoBom $preStateJsonPath $jsonContent
if (-not (Test-Path -LiteralPath $preStateJsonPath)) { throw 'Pre-state JSON file missing after write; aborting before any mutation' }
try { $preState = $jsonContent | ConvertFrom-Json } catch { throw ('Pre-state JSON failed to parse; aborting before any mutation: ' + $_.Exception.Message) }
$priorRevision = Get-Prop $preState.status 'latestReadyRevisionName'
if ([string]::IsNullOrWhiteSpace($priorRevision)) { throw 'Could not determine prior ready revision from pre-state; aborting before any mutation' }
Write-Host ('Prior ready revision (rollback target if unhealthy): ' + $priorRevision)
# Traffic entries are heterogeneous (a 100% entry has no `tag`; a tagged entry
# has no `percent`) -- every optional property is read through Get-Prop so
# StrictMode never throws on a legitimately absent key.
$trafficRaw = Get-Prop $preState.status 'traffic'
if ($null -eq $trafficRaw) { throw 'Pre-state has no status.traffic; aborting before any mutation' }
$trafficArray = @($trafficRaw)
if ($trafficArray.Count -eq 0) { throw 'Pre-state status.traffic is empty; aborting before any mutation' }
$tagEntries = @()
$seenTags = @{}
foreach ($entry in $trafficArray) {
    $tag = Get-Prop $entry 'tag'
    if ($null -eq $tag -or [string]::IsNullOrWhiteSpace($tag)) { continue }
    $revisionName = Get-Prop $entry 'revisionName'
    if ([string]::IsNullOrWhiteSpace($revisionName)) { throw ('Pre-state tag "' + $tag + '" has no revisionName; aborting before any mutation') }
    if (-not (Test-SafeResourceName $tag) -or -not (Test-SafeResourceName $revisionName)) { throw ('Pre-state tag "' + $tag + '" or its revision has an unsafe name; aborting before any mutation') }
    if ($seenTags.ContainsKey($tag)) { throw ('Pre-state has duplicate tag "' + $tag + '"; aborting before any mutation') }
    $seenTags[$tag] = $true
    $tagEntries += [PSCustomObject]@{ Tag = $tag; RevisionName = $revisionName }
}
$tagBlockLines = @()
foreach ($tagEntry in $tagEntries) {
    $tagBlockLines += ('  - tag: ' + $tagEntry.Tag)
    $tagBlockLines += ('    revisionName: ' + $tagEntry.RevisionName)
}
$tagBlock = $tagBlockLines -join "`n"
# Cloud Run v1 requires an explicit run.googleapis.com/secrets location
# annotation alongside per-container secretKeyRef bindings. It is never
# hand-authored: it is read from live pre-state (which already carries the
# real project number) and validated before being re-emitted.
$templateAnnotations = $preState.spec.template.metadata.annotations
$secretsAnnotationRaw = Get-Prop $templateAnnotations 'run.googleapis.com/secrets'
if ([string]::IsNullOrWhiteSpace($secretsAnnotationRaw)) { throw 'Pre-state is missing run.googleapis.com/secrets annotation; aborting before any mutation' }
$secretsAnnotationMap = Test-SecretsAnnotation $secretsAnnotationRaw $expectedAliases
$secretsAnnotationValue = ($urlSecretName + ':' + $secretsAnnotationMap[$urlSecretName] + ',' + $anonSecretName + ':' + $secretsAnnotationMap[$anonSecretName] + ',' + $serviceRoleSecretName + ':' + $secretsAnnotationMap[$serviceRoleSecretName])
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
        run.googleapis.com/secrets: '$secretsAnnotationValue'
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
    Write-Utf8NoBom $specPath $spec
    Write-Host ('Replacing Cloud Run service ' + $serviceName + ' -- query=' + $queryImage + ' tei=' + $teiImage)
    Write-Host 'Traffic: 100% to latestRevision; pre-existing tags preserved from captured pre-state.'
    & gcloud run services replace $specPath --project $projectId --region $region
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    if (Test-Path -LiteralPath $specPath) { Remove-Item -LiteralPath $specPath -Force }
}
# ---- Read-only postdeploy verification: describe + unauthenticated /health only ----
$postState = & gcloud run services describe $serviceName --project $projectId --region $region --format json | ConvertFrom-Json
$newRevision = Get-Prop $postState.status 'latestReadyRevisionName'
if ([string]::IsNullOrWhiteSpace($newRevision) -or $newRevision -eq $priorRevision) { throw 'Postdeploy verification failed: no new ready revision' }
$postTraffic = @(Get-Prop $postState.status 'traffic')
$traffic100 = @($postTraffic | Where-Object { (Get-Prop $_ 'percent') -eq 100 })
if ($traffic100.Count -ne 1 -or (Get-Prop $traffic100[0] 'revisionName') -ne $newRevision) { throw 'Postdeploy verification failed: 100% traffic not on new revision' }
foreach ($tagEntry in $tagEntries) {
    $matching = @($postTraffic | Where-Object { (Get-Prop $_ 'tag') -eq $tagEntry.Tag })
    if ($matching.Count -ne 1 -or (Get-Prop $matching[0] 'revisionName') -ne $tagEntry.RevisionName) {
        throw ('Postdeploy verification failed: tag ' + $tagEntry.Tag + ' is missing or no longer maps to its original revision ' + $tagEntry.RevisionName)
    }
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
$postAnnotations = $postState.spec.template.metadata.annotations
$dependencyAnnotationRaw = Get-Prop $postAnnotations 'run.googleapis.com/container-dependencies'
if ([string]::IsNullOrWhiteSpace($dependencyAnnotationRaw)) { throw 'Postdeploy verification failed: container dependency annotation missing' }
try { $dependencyParsed = $dependencyAnnotationRaw | ConvertFrom-Json } catch { throw 'Postdeploy verification failed: container dependency annotation is not valid JSON' }
$queryDeps = @(Get-Prop $dependencyParsed 'query-service')
if ($queryDeps.Count -ne 1 -or $queryDeps[0] -ne 'voyage-tei') { throw 'Postdeploy verification failed: query-service dependency is not exactly [voyage-tei]' }
$teiProbe = $teiContainer.startupProbe
if ($teiProbe.httpGet.path -ne '/health' -or $teiProbe.httpGet.port -ne 8080 -or $teiProbe.failureThreshold -ne 36 -or $teiProbe.periodSeconds -ne 5 -or $teiProbe.timeoutSeconds -ne 3) { throw 'Postdeploy verification failed: TEI startup probe mismatch' }
$queryProbe = $queryContainer.startupProbe
if ($null -eq $queryProbe.tcpSocket -or $queryProbe.tcpSocket.port -ne [int]$queryPort) { throw 'Postdeploy verification failed: query startup probe is not the expected regenerated TCP default' }
if ((Get-Prop $postAnnotations 'run.googleapis.com/startup-cpu-boost') -ne 'true') { throw 'Postdeploy verification failed: startup CPU boost missing' }
if ((Get-Prop $postAnnotations 'autoscaling.knative.dev/minScale') -ne $minScale -or (Get-Prop $postAnnotations 'autoscaling.knative.dev/maxScale') -ne $maxScale) { throw 'Postdeploy verification failed: scaling mismatch' }
if ($postState.spec.template.spec.containerConcurrency -ne [int]$concurrency) { throw 'Postdeploy verification failed: concurrency mismatch' }
if ($postState.spec.template.spec.timeoutSeconds -ne [int]$timeoutSeconds) { throw 'Postdeploy verification failed: timeout mismatch' }
if ($postState.metadata.annotations.'run.googleapis.com/ingress' -ne $ingress) { throw 'Postdeploy verification failed: ingress mismatch' }
# Secret bindings: verify each env var's secretKeyRef (name + version) and the
# location annotation. Secret VALUES are never read, printed, or compared.
foreach ($binding in @(
    @{ EnvName = 'SUPABASE_URL'; SecretName = $urlSecretName; Version = $urlSecretVersion },
    @{ EnvName = 'SUPABASE_ANON_KEY'; SecretName = $anonSecretName; Version = $anonSecretVersion },
    @{ EnvName = 'SUPABASE_SERVICE_ROLE_KEY'; SecretName = $serviceRoleSecretName; Version = $serviceRoleSecretVersion }
)) {
    $envEntry = @($queryContainer.env | Where-Object { (Get-Prop $_ 'name') -eq $binding.EnvName })
    if ($envEntry.Count -ne 1) { throw ('Postdeploy verification failed: ' + $binding.EnvName + ' env entry missing') }
    $ref = Get-Prop (Get-Prop $envEntry[0] 'valueFrom') 'secretKeyRef'
    if ($null -eq $ref -or (Get-Prop $ref 'name') -ne $binding.SecretName -or (Get-Prop $ref 'key') -ne $binding.Version) {
        throw ('Postdeploy verification failed: ' + $binding.EnvName + ' secretKeyRef mismatch')
    }
}
$postSecretsAnnotationRaw = Get-Prop $postAnnotations 'run.googleapis.com/secrets'
if ([string]::IsNullOrWhiteSpace($postSecretsAnnotationRaw)) { throw 'Postdeploy verification failed: secrets annotation missing' }
Test-SecretsAnnotation $postSecretsAnnotationRaw $expectedAliases | Out-Null
$serviceUrl = $postState.status.url
$health = Invoke-WebRequest -Uri ($serviceUrl + '/health') -Method Get -UseBasicParsing
if ($health.StatusCode -ne 200) { throw 'Postdeploy verification failed: /health did not return 200' }
Write-Host 'Postdeploy verification passed. Rollback artifacts retained on disk:'
Write-Host ('  ' + $preStateYamlPath)
Write-Host ('  ' + $preStateJsonPath)
Write-Host ('Primary rollback (traffic percentages only; tags unaffected): gcloud run services update-traffic ' + $serviceName + ' --to-revisions=' + $priorRevision + '=100 --project ' + $projectId + ' --region ' + $region)
