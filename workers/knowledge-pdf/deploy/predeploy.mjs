const environment = process.env;

function required(name) {
  const value = environment[name];
  if (!value || !value.trim()) throw new Error(name + ' is required');
  return value.trim();
}

function validate(name, value, pattern, description) {
  if (!pattern.test(value)) throw new Error(name + ' is invalid: ' + description);
}

function positiveInteger(name, value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(name + ' must be a positive integer');
  }
  return parsed;
}

const projectId = required('GCP_PROJECT_ID');
const region = required('GCP_REGION');
const imageDigest = required('IMAGE_DIGEST');
const serviceAccount = required('SERVICE_ACCOUNT_EMAIL');
const urlSecret = required('SUPABASE_URL_SECRET_NAME');
const serviceRoleSecret = required('SUPABASE_SERVICE_ROLE_KEY_SECRET_NAME');
const secretVersion = required('SUPABASE_SECRET_VERSION');
const workerPool = environment.WORKER_POOL_NAME?.trim() || 'collabboard-knowledge-pdf-worker';

validate('GCP_PROJECT_ID', projectId, /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/, 'a Google Cloud project ID');
validate('GCP_REGION', region, /^[a-z0-9]+-[a-z0-9-]+[0-9]$/, 'a supported Cloud Run region');
validate('IMAGE_DIGEST', imageDigest, /^sha256:[a-f0-9]{64}$/i, 'sha256:<64 hexadecimal characters>');
validate(
  'SERVICE_ACCOUNT_EMAIL',
  serviceAccount,
  /^[a-z][a-z0-9-]{4,28}[a-z0-9]@[a-z][a-z0-9-]{4,28}[a-z0-9]\.iam\.gserviceaccount\.com$/,
  'a dedicated service-account email',
);
validate('WORKER_POOL_NAME', workerPool, /^[a-z][a-z0-9-]{0,47}[a-z0-9]$/, 'a lowercase Cloud Run worker-pool name');
validate('SUPABASE_URL_SECRET_NAME', urlSecret, /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,254}$/, 'a Secret Manager name');
validate(
  'SUPABASE_SERVICE_ROLE_KEY_SECRET_NAME',
  serviceRoleSecret,
  /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,254}$/,
  'a Secret Manager name',
);
validate('SUPABASE_SECRET_VERSION', secretVersion, /^[1-9][0-9]*$/, 'a pinned positive Secret Manager version');

const cpu = environment.GCP_WORKER_CPU?.trim() || '2';
const memory = environment.GCP_WORKER_MEMORY?.trim() || '4Gi';
if (!['1', '2', '4', '6', '8'].includes(cpu)) {
  throw new Error('GCP_WORKER_CPU must be one of 1, 2, 4, 6, or 8');
}
if (!/^[1-9][0-9]*(?:Mi|Gi|M|G)$/.test(memory)) {
  throw new Error('GCP_WORKER_MEMORY must use a positive Mi, Gi, M, or G value');
}

const config = {
  concurrency: positiveInteger(
    'KNOWLEDGE_PDF_WORKER_CONCURRENCY',
    environment.KNOWLEDGE_PDF_WORKER_CONCURRENCY || '2',
  ),
  pollIntervalMs: positiveInteger(
    'KNOWLEDGE_PDF_POLL_INTERVAL_MS',
    environment.KNOWLEDGE_PDF_POLL_INTERVAL_MS || '5000',
  ),
  discoveryLimit: positiveInteger(
    'KNOWLEDGE_PDF_DISCOVERY_LIMIT',
    environment.KNOWLEDGE_PDF_DISCOVERY_LIMIT || '16',
  ),
  leaseTtlSeconds: positiveInteger(
    'KNOWLEDGE_PROCESSING_LEASE_TTL_SECONDS',
    environment.KNOWLEDGE_PROCESSING_LEASE_TTL_SECONDS || '300',
  ),
  heartbeatIntervalMs: positiveInteger(
    'KNOWLEDGE_PROCESSING_HEARTBEAT_INTERVAL_MS',
    environment.KNOWLEDGE_PROCESSING_HEARTBEAT_INTERVAL_MS || '100000',
  ),
  parserTimeoutMs: positiveInteger(
    'OPENDATALOADER_TIMEOUT_MS',
    environment.OPENDATALOADER_TIMEOUT_MS || '120000',
  ),
};

if (config.concurrency > 32) throw new Error('KNOWLEDGE_PDF_WORKER_CONCURRENCY must be <= 32');
if (config.discoveryLimit > 100) throw new Error('KNOWLEDGE_PDF_DISCOVERY_LIMIT must be <= 100');

console.log(JSON.stringify({
  status: 'valid',
  projectId,
  region,
  workerPool,
  imageDigest,
  serviceAccount,
  instances: 1,
  cpu,
  memory,
  secretNames: {
    supabaseUrl: urlSecret,
    supabaseServiceRoleKey: serviceRoleSecret,
    version: secretVersion,
  },
  workerConfig: config,
}, null, 2));
