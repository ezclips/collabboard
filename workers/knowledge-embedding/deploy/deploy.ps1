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
$nodeDigest = Required-Environment 'IMAGE_DIGEST'
$teiDigest = Required-Environment 'TEI_IMAGE_DIGEST'
$serviceAccount = Required-Environment 'SERVICE_ACCOUNT_EMAIL'
$urlSecret = Required-Environment 'SUPABASE_URL_SECRET_NAME'
$urlVersion = Required-Environment 'SUPABASE_URL_SECRET_VERSION'
$serviceRoleSecret = Required-Environment 'SUPABASE_SERVICE_ROLE_KEY_SECRET_NAME'
$serviceRoleVersion = Required-Environment 'SUPABASE_SERVICE_ROLE_KEY_SECRET_VERSION'
$createdAfter = Required-Environment 'KNOWLEDGE_EMBEDDING_CREATED_AFTER'

$workerPool = [Environment]::GetEnvironmentVariable('WORKER_POOL_NAME')
if ([string]::IsNullOrWhiteSpace($workerPool)) { $workerPool = 'collabboard-knowledge-embedding-worker' }
$nodeCpu = [Environment]::GetEnvironmentVariable('GCP_WORKER_CPU')
if ([string]::IsNullOrWhiteSpace($nodeCpu)) { $nodeCpu = '1' }
$nodeMemory = [Environment]::GetEnvironmentVariable('GCP_WORKER_MEMORY')
if ([string]::IsNullOrWhiteSpace($nodeMemory)) { $nodeMemory = '1Gi' }
$teiCpu = [Environment]::GetEnvironmentVariable('GCP_TEI_CPU')
if ([string]::IsNullOrWhiteSpace($teiCpu)) { $teiCpu = '2' }
$teiMemory = [Environment]::GetEnvironmentVariable('GCP_TEI_MEMORY')
if ([string]::IsNullOrWhiteSpace($teiMemory)) { $teiMemory = '4Gi' }
$model = [Environment]::GetEnvironmentVariable('KNOWLEDGE_EMBEDDING_MODEL')
if ([string]::IsNullOrWhiteSpace($model)) { $model = 'voyageai/voyage-4-nano' }
$modelId = [Environment]::GetEnvironmentVariable('KNOWLEDGE_EMBEDDING_MODEL_ID')
if ([string]::IsNullOrWhiteSpace($modelId)) { $modelId = 'local:voyage-4-nano' }
$dimensions = [Environment]::GetEnvironmentVariable('KNOWLEDGE_EMBEDDING_DIMENSIONS')
if ([string]::IsNullOrWhiteSpace($dimensions)) { $dimensions = '1024' }
$teiUrl = [Environment]::GetEnvironmentVariable('KNOWLEDGE_EMBEDDING_TEI_URL')
if ([string]::IsNullOrWhiteSpace($teiUrl)) { $teiUrl = 'http://127.0.0.1:8080' }
$batchSize = [Environment]::GetEnvironmentVariable('KNOWLEDGE_EMBEDDING_BATCH_SIZE')
if ([string]::IsNullOrWhiteSpace($batchSize)) { $batchSize = '16' }
$pollInterval = [Environment]::GetEnvironmentVariable('KNOWLEDGE_EMBEDDING_POLL_INTERVAL_MS')
if ([string]::IsNullOrWhiteSpace($pollInterval)) { $pollInterval = '5000' }
$discoveryLimit = [Environment]::GetEnvironmentVariable('KNOWLEDGE_EMBEDDING_DISCOVERY_LIMIT')
if ([string]::IsNullOrWhiteSpace($discoveryLimit)) { $discoveryLimit = '16' }
$requestTimeout = [Environment]::GetEnvironmentVariable('KNOWLEDGE_EMBEDDING_REQUEST_TIMEOUT_MS')
if ([string]::IsNullOrWhiteSpace($requestTimeout)) { $requestTimeout = '30000' }

$nodeImage = $region + '-docker.pkg.dev/' + $projectId + '/collabboard-workers/knowledge-embedding-worker@' + $nodeDigest
$teiImage = $region + '-docker.pkg.dev/' + $projectId + '/collabboard-workers/knowledge-embedding-tei@' + $teiDigest
$workerPoolSpec = @"
apiVersion: run.googleapis.com/v1
kind: WorkerPool
metadata:
  name: $workerPool
  annotations:
    run.googleapis.com/scalingMode: manual
    run.googleapis.com/manualInstanceCount: "0"
spec:
  template:
    metadata:
      annotations:
        run.googleapis.com/container-dependencies: '{"knowledge-worker":["voyage-tei"]}'
    spec:
      serviceAccountName: $serviceAccount
      containers:
      - name: knowledge-worker
        image: $nodeImage
        resources:
          limits:
            cpu: "$nodeCpu"
            memory: "$nodeMemory"
        env:
        - name: KNOWLEDGE_EMBEDDING_PROVIDER
          value: local-tei
        - name: KNOWLEDGE_EMBEDDING_TEI_URL
          value: "$teiUrl"
        - name: KNOWLEDGE_EMBEDDING_MODEL
          value: "$model"
        - name: KNOWLEDGE_EMBEDDING_MODEL_ID
          value: "$modelId"
        - name: KNOWLEDGE_EMBEDDING_DIMENSIONS
          value: "$dimensions"
        - name: KNOWLEDGE_EMBEDDING_BATCH_SIZE
          value: "$batchSize"
        - name: KNOWLEDGE_EMBEDDING_POLL_INTERVAL_MS
          value: "$pollInterval"
        - name: KNOWLEDGE_EMBEDDING_DISCOVERY_LIMIT
          value: "$discoveryLimit"
        - name: KNOWLEDGE_EMBEDDING_REQUEST_TIMEOUT_MS
          value: "$requestTimeout"
        - name: KNOWLEDGE_EMBEDDING_CREATED_AFTER
          value: "$createdAfter"
        - name: SUPABASE_URL
          valueFrom:
            secretKeyRef:
              name: "$urlSecret"
              key: "$urlVersion"
        - name: SUPABASE_SERVICE_ROLE_KEY
          valueFrom:
            secretKeyRef:
              name: "$serviceRoleSecret"
              key: "$serviceRoleVersion"
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
          timeoutSeconds: 3
          periodSeconds: 5
          failureThreshold: 36
"@

$specPath = Join-Path ([IO.Path]::GetTempPath()) ('collabboard-worker-pool-' + [Guid]::NewGuid().ToString('N') + '.yaml')
try {
    Set-Content -LiteralPath $specPath -Value $workerPoolSpec -Encoding utf8 -NoNewline
    Write-Host ('Preparing disabled two-container Worker Pool ' + $workerPool + ' with instances=0')
    Write-Host ('Node image=' + $nodeImage + ' CPU=' + $nodeCpu + ' Memory=' + $nodeMemory)
    Write-Host ('TEI image=' + $teiImage + ' CPU=' + $teiCpu + ' Memory=' + $teiMemory + ' URL=' + $teiUrl)
    Write-Host 'TEI startup probe: GET /health, 36 attempts x 5 seconds (180 second allowance).'
    & gcloud run worker-pools replace $specPath --project $projectId --region $region
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    if (Test-Path -LiteralPath $specPath) { Remove-Item -LiteralPath $specPath -Force }
}
