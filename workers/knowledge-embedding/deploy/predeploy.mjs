const DEFAULT_POOL = 'collabboard-knowledge-embedding-worker';
const DEFAULT_PROVIDER = 'local-tei';
const DEFAULT_MODEL = 'voyageai/voyage-4-nano';
const DEFAULT_MODEL_ID = 'local:voyage-4-nano';
const DEFAULT_DIMENSIONS = '1024';
const DEFAULT_TEI_URL = 'http://127.0.0.1:8080';
const DEFAULT_NODE_CPU = '1';
const DEFAULT_NODE_MEMORY = '1Gi';
const DEFAULT_TEI_CPU = '2';
const DEFAULT_TEI_MEMORY = '3Gi';
const DEFAULT_INSTANCES = '0';
const DEFAULT_BATCH_SIZE = '16';
const DEFAULT_POLL_INTERVAL_MS = '5000';
const DEFAULT_DISCOVERY_LIMIT = '16';
const DEFAULT_REQUEST_TIMEOUT_MS = '30000';
const PRODUCTION_CUTOFF = '2026-08-21T22:06:19Z';

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

function immutableDigest(name) {
  const value = required(name);
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) throw new Error(`${name} must be sha256:<64 lowercase hex characters>`);
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
  const nodeDigest = immutableDigest('IMAGE_DIGEST');
  const teiDigest = immutableDigest('TEI_IMAGE_DIGEST');
  const pool = (process.env.WORKER_POOL_NAME || DEFAULT_POOL).trim();
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(pool)) throw new Error('WORKER_POOL_NAME has invalid syntax');
  const serviceAccount = required('SERVICE_ACCOUNT_EMAIL');
  const accountMatch = serviceAccount.match(/^([^@\s]+)@([^@\s]+)\.iam\.gserviceaccount\.com$/);
  if (!accountMatch || accountMatch[2] !== project) throw new Error('SERVICE_ACCOUNT_EMAIL must belong to GCP_PROJECT_ID');
  const accountId = accountMatch[1];
  if (accountId.length < 6 || accountId.length > 30 || !/^[a-z0-9](?:[a-z0-9-]{4,28}[a-z0-9])$/.test(accountId)) {
    throw new Error('SERVICE_ACCOUNT_EMAIL account ID must be 6-30 lowercase alphanumeric characters or hyphens');
  }

  const provider = (process.env.KNOWLEDGE_EMBEDDING_PROVIDER || DEFAULT_PROVIDER).trim();
  if (provider !== DEFAULT_PROVIDER) throw new Error('Embedding deployment preparation requires KNOWLEDGE_EMBEDDING_PROVIDER=local-tei');
  const model = (process.env.KNOWLEDGE_EMBEDDING_MODEL || DEFAULT_MODEL).trim();
  const modelId = (process.env.KNOWLEDGE_EMBEDDING_MODEL_ID || DEFAULT_MODEL_ID).trim();
  const dimensions = (process.env.KNOWLEDGE_EMBEDDING_DIMENSIONS || DEFAULT_DIMENSIONS).trim();
  const teiUrl = (process.env.KNOWLEDGE_EMBEDDING_TEI_URL || DEFAULT_TEI_URL).trim();
  if (model !== DEFAULT_MODEL || modelId !== DEFAULT_MODEL_ID || dimensions !== DEFAULT_DIMENSIONS) {
    throw new Error('Local TEI embedding profile must be Voyage-4-nano at 1024 dimensions');
  }
  if (teiUrl !== DEFAULT_TEI_URL) throw new Error('KNOWLEDGE_EMBEDDING_TEI_URL must be http://127.0.0.1:8080');
  if (process.env.OPENAI_API_KEY_SECRET_NAME || process.env.OPENAI_API_KEY_SECRET_VERSION) {
    throw new Error('OpenAI secrets must be absent from the local-tei deployment');
  }

  const nodeCpu = (process.env.GCP_WORKER_CPU || DEFAULT_NODE_CPU).trim();
  const nodeMemory = (process.env.GCP_WORKER_MEMORY || DEFAULT_NODE_MEMORY).trim();
  const teiCpu = (process.env.GCP_TEI_CPU || DEFAULT_TEI_CPU).trim();
  const teiMemory = (process.env.GCP_TEI_MEMORY || DEFAULT_TEI_MEMORY).trim();
  if (nodeCpu !== DEFAULT_NODE_CPU || nodeMemory !== DEFAULT_NODE_MEMORY) throw new Error('Node worker sizing must be CPU=1 and memory=1Gi');
  if (teiCpu !== DEFAULT_TEI_CPU || teiMemory !== DEFAULT_TEI_MEMORY) throw new Error('TEI sizing must be CPU=2 and memory=3Gi');
  const instances = (process.env.GCP_WORKER_INSTANCES || DEFAULT_INSTANCES).trim();
  if (instances !== DEFAULT_INSTANCES) throw new Error('Worker Pool instances must remain 0 in deployment preparation');

  const createdAfter = isoDateTime('KNOWLEDGE_EMBEDDING_CREATED_AFTER');
  if (createdAfter !== PRODUCTION_CUTOFF) throw new Error(`KNOWLEDGE_EMBEDDING_CREATED_AFTER must remain ${PRODUCTION_CUTOFF}`);
  const config = {
    batchSize: positive('KNOWLEDGE_EMBEDDING_BATCH_SIZE', DEFAULT_BATCH_SIZE, 2048),
    pollIntervalMs: positive('KNOWLEDGE_EMBEDDING_POLL_INTERVAL_MS', DEFAULT_POLL_INTERVAL_MS, 3_600_000),
    discoveryLimit: positive('KNOWLEDGE_EMBEDDING_DISCOVERY_LIMIT', DEFAULT_DISCOVERY_LIMIT, 100),
    requestTimeoutMs: positive('KNOWLEDGE_EMBEDDING_REQUEST_TIMEOUT_MS', DEFAULT_REQUEST_TIMEOUT_MS, 120_000),
  };
  const secrets = {
    SUPABASE_URL: secretReference('SUPABASE_URL_SECRET_NAME', 'SUPABASE_URL_SECRET_VERSION'),
    SUPABASE_SERVICE_ROLE_KEY: secretReference('SUPABASE_SERVICE_ROLE_KEY_SECRET_NAME', 'SUPABASE_SERVICE_ROLE_KEY_SECRET_VERSION'),
  };
  return {
    project, region, pool, serviceAccount, provider, model, modelId, dimensions, teiUrl,
    nodeCpu, nodeMemory, teiCpu, teiMemory, instances, nodeDigest, teiDigest,
    workerImage: `${region}-docker.pkg.dev/${project}/collabboard-workers/knowledge-embedding-worker@${nodeDigest}`,
    teiImage: `${region}-docker.pkg.dev/${project}/collabboard-workers/knowledge-embedding-tei@${teiDigest}`,
    config, createdAfter, secrets,
  };
}

console.log(JSON.stringify({ status: 'predeploy-ok', ...validate() }));
