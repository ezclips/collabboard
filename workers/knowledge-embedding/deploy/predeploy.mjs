const DEFAULT_POOL = 'collabboard-knowledge-embedding-worker';
const DEFAULT_CPU = '1';
const DEFAULT_MEMORY = '1Gi';
const DEFAULT_MODEL = 'text-embedding-3-small';
const DEFAULT_MODEL_ID = 'openai:text-embedding-3-small';
const DEFAULT_DIMENSIONS = '1536';
const DEFAULT_BATCH_SIZE = '16';
const DEFAULT_POLL_INTERVAL_MS = '5000';
const DEFAULT_DISCOVERY_LIMIT = '16';
const DEFAULT_REQUEST_TIMEOUT_MS = '30000';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function positive(name, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const value = (process.env[name] ?? fallback).trim();
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > maximum) {
    throw new Error(`${name} must be a positive bounded integer`);
  }
  return value;
}

function secretReference(name, versionName) {
  const secret = required(name);
  const version = required(versionName);
  if (!/^[A-Za-z0-9_-]{1,255}$/.test(secret)) throw new Error(`${name} has invalid Secret Manager name syntax`);
  if (!/^\d+$/.test(version) || Number(version) < 1) throw new Error(`${versionName} must be a pinned positive integer`);
  return `${secret}:${version}`;
}

function isoDateTime(name) {
  const value = required(name);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`${name} must be a valid ISO-8601 date-time`);
  }
  return value;
}

function validate() {
  const project = required('GCP_PROJECT_ID');
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project)) throw new Error('GCP_PROJECT_ID has invalid syntax');
  const region = required('GCP_REGION');
  if (!/^[a-z]+-[a-z0-9]+[0-9]$/.test(region)) throw new Error('GCP_REGION has invalid syntax');
  const digest = required('IMAGE_DIGEST');
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) throw new Error('IMAGE_DIGEST must be sha256:<64 lowercase hex characters>');
  const pool = (process.env.WORKER_POOL_NAME || DEFAULT_POOL).trim();
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(pool)) throw new Error('WORKER_POOL_NAME has invalid syntax');
  const serviceAccount = required('SERVICE_ACCOUNT_EMAIL');
  if (!/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(serviceAccount)) throw new Error('SERVICE_ACCOUNT_EMAIL has invalid syntax');
  const cpu = (process.env.GCP_WORKER_CPU || DEFAULT_CPU).trim();
  const memory = (process.env.GCP_WORKER_MEMORY || DEFAULT_MEMORY).trim();
  if (cpu !== '1' || memory !== '1Gi') throw new Error('Initial embedding worker sizing must be CPU=1 and memory=1Gi');
  const model = (process.env.KNOWLEDGE_EMBEDDING_MODEL || DEFAULT_MODEL).trim();
  const modelId = (process.env.KNOWLEDGE_EMBEDDING_MODEL_ID || DEFAULT_MODEL_ID).trim();
  if (!model || !modelId) throw new Error('Embedding model and model_id are required');
  if ((process.env.KNOWLEDGE_EMBEDDING_DIMENSIONS || DEFAULT_DIMENSIONS).trim() !== DEFAULT_DIMENSIONS) throw new Error('Initial embedding dimensions must be 1536');
  const config = {
    model, modelId, dimensions: DEFAULT_DIMENSIONS,
    batchSize: positive('KNOWLEDGE_EMBEDDING_BATCH_SIZE', DEFAULT_BATCH_SIZE, 2048),
    pollIntervalMs: positive('KNOWLEDGE_EMBEDDING_POLL_INTERVAL_MS', DEFAULT_POLL_INTERVAL_MS, 3_600_000),
    discoveryLimit: positive('KNOWLEDGE_EMBEDDING_DISCOVERY_LIMIT', DEFAULT_DISCOVERY_LIMIT, 100),
    requestTimeoutMs: positive('KNOWLEDGE_EMBEDDING_REQUEST_TIMEOUT_MS', DEFAULT_REQUEST_TIMEOUT_MS, 120_000),
    createdAfter: isoDateTime('KNOWLEDGE_EMBEDDING_CREATED_AFTER'),
  };
  const secrets = {
    SUPABASE_URL: secretReference('SUPABASE_URL_SECRET_NAME', 'SUPABASE_URL_SECRET_VERSION'),
    SUPABASE_SERVICE_ROLE_KEY: secretReference('SUPABASE_SERVICE_ROLE_KEY_SECRET_NAME', 'SUPABASE_SERVICE_ROLE_KEY_SECRET_VERSION'),
    OPENAI_API_KEY: secretReference('OPENAI_API_KEY_SECRET_NAME', 'OPENAI_API_KEY_SECRET_VERSION'),
  };
  return {
    project, region, pool, serviceAccount, cpu, memory, digest,
    image: `${region}-docker.pkg.dev/${project}/collabboard-workers/knowledge-embedding-worker@${digest}`,
    config, secrets,
  };
}

console.log(JSON.stringify({ status: 'predeploy-ok', ...validate() }));
