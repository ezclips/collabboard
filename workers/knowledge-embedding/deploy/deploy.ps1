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
$imageDigest = Required-Environment 'IMAGE_DIGEST'
$serviceAccount = Required-Environment 'SERVICE_ACCOUNT_EMAIL'
$urlSecret = Required-Environment 'SUPABASE_URL_SECRET_NAME'
$urlVersion = Required-Environment 'SUPABASE_URL_SECRET_VERSION'
$serviceRoleSecret = Required-Environment 'SUPABASE_SERVICE_ROLE_KEY_SECRET_NAME'
$serviceRoleVersion = Required-Environment 'SUPABASE_SERVICE_ROLE_KEY_SECRET_VERSION'
$openAiSecret = Required-Environment 'OPENAI_API_KEY_SECRET_NAME'
$openAiVersion = Required-Environment 'OPENAI_API_KEY_SECRET_VERSION'
$createdAfter = Required-Environment 'KNOWLEDGE_EMBEDDING_CREATED_AFTER'

$workerPool = [Environment]::GetEnvironmentVariable('WORKER_POOL_NAME')
if ([string]::IsNullOrWhiteSpace($workerPool)) { $workerPool = 'collabboard-knowledge-embedding-worker' }
$cpu = [Environment]::GetEnvironmentVariable('GCP_WORKER_CPU')
if ([string]::IsNullOrWhiteSpace($cpu)) { $cpu = '1' }
$memory = [Environment]::GetEnvironmentVariable('GCP_WORKER_MEMORY')
if ([string]::IsNullOrWhiteSpace($memory)) { $memory = '1Gi' }
$model = [Environment]::GetEnvironmentVariable('KNOWLEDGE_EMBEDDING_MODEL')
if ([string]::IsNullOrWhiteSpace($model)) { $model = 'text-embedding-3-small' }
$modelId = [Environment]::GetEnvironmentVariable('KNOWLEDGE_EMBEDDING_MODEL_ID')
if ([string]::IsNullOrWhiteSpace($modelId)) { $modelId = 'openai:text-embedding-3-small' }
$dimensions = [Environment]::GetEnvironmentVariable('KNOWLEDGE_EMBEDDING_DIMENSIONS')
if ([string]::IsNullOrWhiteSpace($dimensions)) { $dimensions = '1536' }
$batchSize = [Environment]::GetEnvironmentVariable('KNOWLEDGE_EMBEDDING_BATCH_SIZE')
if ([string]::IsNullOrWhiteSpace($batchSize)) { $batchSize = '16' }
$pollInterval = [Environment]::GetEnvironmentVariable('KNOWLEDGE_EMBEDDING_POLL_INTERVAL_MS')
if ([string]::IsNullOrWhiteSpace($pollInterval)) { $pollInterval = '5000' }
$discoveryLimit = [Environment]::GetEnvironmentVariable('KNOWLEDGE_EMBEDDING_DISCOVERY_LIMIT')
if ([string]::IsNullOrWhiteSpace($discoveryLimit)) { $discoveryLimit = '16' }
$requestTimeout = [Environment]::GetEnvironmentVariable('KNOWLEDGE_EMBEDDING_REQUEST_TIMEOUT_MS')
if ([string]::IsNullOrWhiteSpace($requestTimeout)) { $requestTimeout = '30000' }

$image = $region + '-docker.pkg.dev/' + $projectId + '/collabboard-workers/knowledge-embedding-worker@' + $imageDigest
$envVars = @(
    'KNOWLEDGE_EMBEDDING_MODEL=' + $model
    'KNOWLEDGE_EMBEDDING_MODEL_ID=' + $modelId
    'KNOWLEDGE_EMBEDDING_DIMENSIONS=' + $dimensions
    'KNOWLEDGE_EMBEDDING_BATCH_SIZE=' + $batchSize
    'KNOWLEDGE_EMBEDDING_POLL_INTERVAL_MS=' + $pollInterval
    'KNOWLEDGE_EMBEDDING_DISCOVERY_LIMIT=' + $discoveryLimit
    'KNOWLEDGE_EMBEDDING_REQUEST_TIMEOUT_MS=' + $requestTimeout
    'KNOWLEDGE_EMBEDDING_CREATED_AFTER=' + $createdAfter
) -join ','
$secretRefs = @(
    'SUPABASE_URL=' + $urlSecret + ':' + $urlVersion
    'SUPABASE_SERVICE_ROLE_KEY=' + $serviceRoleSecret + ':' + $serviceRoleVersion
    'OPENAI_API_KEY=' + $openAiSecret + ':' + $openAiVersion
) -join ','

Write-Host ('Deploying immutable embedding image to Worker Pool ' + $workerPool)
Write-Host ('Project=' + $projectId + ' Region=' + $region + ' Instances=1 CPU=' + $cpu + ' Memory=' + $memory)
Write-Host ('Secret references=' + $urlSecret + ':' + $urlVersion + ',' + $serviceRoleSecret + ':' + $serviceRoleVersion + ',' + $openAiSecret + ':' + $openAiVersion)

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
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
