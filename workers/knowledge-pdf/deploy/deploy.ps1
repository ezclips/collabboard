$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$deployDirectory = $PSScriptRoot
& node (Join-Path $deployDirectory 'predeploy.mjs')
if ($LASTEXITCODE -ne 0) {
    throw 'Deployment preflight failed'
}

function Required-Environment([string] $Name) {
    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw ($Name + ' is required')
    }
    return $value.Trim()
}

$projectId = Required-Environment 'GCP_PROJECT_ID'
$region = Required-Environment 'GCP_REGION'
$imageDigest = Required-Environment 'IMAGE_DIGEST'
$serviceAccount = Required-Environment 'SERVICE_ACCOUNT_EMAIL'
$urlSecret = Required-Environment 'SUPABASE_URL_SECRET_NAME'
$serviceRoleSecret = Required-Environment 'SUPABASE_SERVICE_ROLE_KEY_SECRET_NAME'
$secretVersion = Required-Environment 'SUPABASE_SECRET_VERSION'

$workerPool = [Environment]::GetEnvironmentVariable('WORKER_POOL_NAME')
if ([string]::IsNullOrWhiteSpace($workerPool)) {
    $workerPool = 'collabboard-knowledge-pdf-worker'
}

$cpu = [Environment]::GetEnvironmentVariable('GCP_WORKER_CPU')
if ([string]::IsNullOrWhiteSpace($cpu)) {
    $cpu = '2'
}

$memory = [Environment]::GetEnvironmentVariable('GCP_WORKER_MEMORY')
if ([string]::IsNullOrWhiteSpace($memory)) {
    $memory = '4Gi'
}

$concurrency = [Environment]::GetEnvironmentVariable('KNOWLEDGE_PDF_WORKER_CONCURRENCY')
if ([string]::IsNullOrWhiteSpace($concurrency)) {
    $concurrency = '2'
}

$pollIntervalMs = [Environment]::GetEnvironmentVariable('KNOWLEDGE_PDF_POLL_INTERVAL_MS')
if ([string]::IsNullOrWhiteSpace($pollIntervalMs)) {
    $pollIntervalMs = '5000'
}

$discoveryLimit = [Environment]::GetEnvironmentVariable('KNOWLEDGE_PDF_DISCOVERY_LIMIT')
if ([string]::IsNullOrWhiteSpace($discoveryLimit)) {
    $discoveryLimit = '16'
}

$leaseTtlSeconds = [Environment]::GetEnvironmentVariable('KNOWLEDGE_PROCESSING_LEASE_TTL_SECONDS')
if ([string]::IsNullOrWhiteSpace($leaseTtlSeconds)) {
    $leaseTtlSeconds = '300'
}

$heartbeatIntervalMs = [Environment]::GetEnvironmentVariable('KNOWLEDGE_PROCESSING_HEARTBEAT_INTERVAL_MS')
if ([string]::IsNullOrWhiteSpace($heartbeatIntervalMs)) {
    $heartbeatIntervalMs = '100000'
}

$parserTimeoutMs = [Environment]::GetEnvironmentVariable('OPENDATALOADER_TIMEOUT_MS')
if ([string]::IsNullOrWhiteSpace($parserTimeoutMs)) {
    $parserTimeoutMs = '120000'
}

$image = $region + '-docker.pkg.dev/' + $projectId + '/collabboard-workers/knowledge-pdf-worker@' + $imageDigest
$envVars = @(
    'KNOWLEDGE_PDF_WORKER_CONCURRENCY=' + $concurrency
    'KNOWLEDGE_PDF_POLL_INTERVAL_MS=' + $pollIntervalMs
    'KNOWLEDGE_PDF_DISCOVERY_LIMIT=' + $discoveryLimit
    'KNOWLEDGE_PROCESSING_LEASE_TTL_SECONDS=' + $leaseTtlSeconds
    'KNOWLEDGE_PROCESSING_HEARTBEAT_INTERVAL_MS=' + $heartbeatIntervalMs
    'OPENDATALOADER_TIMEOUT_MS=' + $parserTimeoutMs
) -join ','
$secretRefs = 'SUPABASE_URL=' + $urlSecret + ':' + $secretVersion + ',SUPABASE_SERVICE_ROLE_KEY=' + $serviceRoleSecret + ':' + $secretVersion

Write-Host ('Deploying immutable image to Cloud Run Worker Pool ' + $workerPool)
Write-Host ('Project=' + $projectId + ' Region=' + $region + ' Instances=1 CPU=' + $cpu + ' Memory=' + $memory)
Write-Host 'Supabase credentials are referenced by Secret Manager name and pinned version only.'

$gcloudArguments = @(
    'beta', 'run', 'worker-pools', 'deploy', $workerPool,
    '--project', $projectId,
    '--region', $region,
    '--image', $image,
    '--instances', '1',
    '--cpu', $cpu,
    '--memory', $memory,
    '--service-account', $serviceAccount,
    '--set-env-vars', $envVars,
    '--update-secrets', $secretRefs
)

& gcloud @gcloudArguments
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
