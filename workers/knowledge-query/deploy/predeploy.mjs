const PROJECT = 'callabboard';
const REGION = 'europe-west6';
const SERVICE = 'collabboard-knowledge-query';
const SERVICE_ACCOUNT = 'collabboard-query-service@callabboard.iam.gserviceaccount.com';
const QUERY_REPOSITORY = 'europe-west6-docker.pkg.dev/callabboard/collabboard-workers/knowledge-query';
const TEI_REPOSITORY = 'europe-west6-docker.pkg.dev/callabboard/collabboard-workers/knowledge-embedding-tei';
const QUERY_PORT = '8081';
const QUERY_CPU = '1';
const QUERY_MEMORY = '512Mi';
const TEI_CPU = '2';
const TEI_MEMORY = '6Gi';
const TEI_URL = 'http://127.0.0.1:8080';
const CONCURRENCY = '8';
const MIN_SCALE = '0';
const MAX_SCALE = '1';
const TIMEOUT_SECONDS = '180';
const INGRESS = 'all';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function exact(name, expected) {
  const value = required(name);
  if (value !== expected) throw new Error(`${name} must be ${expected}`);
  return value;
}

function immutableDigest(name) {
  const value = required(name);
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) throw new Error(`${name} must be sha256:<64 lowercase hex characters>`);
  return value;
}

function secretVersion(name) {
  const value = required(name);
  if (!/^\d+$/.test(value) || Number(value) < 1) throw new Error(`${name} must be a pinned positive integer, not "latest"`);
  return value;
}

function secretName(name, expected) {
  const value = required(name);
  if (value !== expected) throw new Error(`${name} must be ${expected}`);
  return value;
}

function validate() {
  const project = exact('GCP_PROJECT_ID', PROJECT);
  const region = exact('GCP_REGION', REGION);
  const service = exact('SERVICE_NAME', SERVICE);
  const serviceAccount = exact('SERVICE_ACCOUNT_EMAIL', SERVICE_ACCOUNT);

  const queryDigest = immutableDigest('QUERY_IMAGE_DIGEST');
  const teiDigest = immutableDigest('TEI_IMAGE_DIGEST');

  const queryCpu = exact('QUERY_CPU', QUERY_CPU);
  const queryMemory = exact('QUERY_MEMORY', QUERY_MEMORY);
  const teiCpu = exact('TEI_CPU', TEI_CPU);
  const teiMemory = exact('TEI_MEMORY', TEI_MEMORY);
  const queryPort = exact('QUERY_PORT', QUERY_PORT);

  const teiUrl = exact('KNOWLEDGE_EMBEDDING_TEI_URL', TEI_URL);
  let parsedTeiUrl;
  try { parsedTeiUrl = new URL(teiUrl); } catch { throw new Error('KNOWLEDGE_EMBEDDING_TEI_URL must be a valid URL'); }
  if (parsedTeiUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]', '::1'].includes(parsedTeiUrl.hostname.toLowerCase())) {
    throw new Error('KNOWLEDGE_EMBEDDING_TEI_URL must be an unauthenticated HTTP loopback URL');
  }

  const concurrency = exact('CONTAINER_CONCURRENCY', CONCURRENCY);
  const minScale = exact('AUTOSCALING_MIN_SCALE', MIN_SCALE);
  const maxScale = exact('AUTOSCALING_MAX_SCALE', MAX_SCALE);
  const timeoutSeconds = exact('REQUEST_TIMEOUT_SECONDS', TIMEOUT_SECONDS);
  const ingress = exact('INGRESS', INGRESS);

  const supabaseUrlSecret = secretName('SUPABASE_URL_SECRET_NAME', 'collabboard-supabase-url');
  const supabaseUrlVersion = secretVersion('SUPABASE_URL_SECRET_VERSION');
  const supabaseAnonSecret = secretName('SUPABASE_ANON_KEY_SECRET_NAME', 'collabboard-supabase-anon-key');
  const supabaseAnonVersion = secretVersion('SUPABASE_ANON_KEY_SECRET_VERSION');
  const supabaseServiceRoleSecret = secretName('SUPABASE_SERVICE_ROLE_KEY_SECRET_NAME', 'collabboard-supabase-service-role-key');
  const supabaseServiceRoleVersion = secretVersion('SUPABASE_SERVICE_ROLE_KEY_SECRET_VERSION');

  return {
    project, region, service, serviceAccount,
    queryImage: `${QUERY_REPOSITORY}@${queryDigest}`,
    teiImage: `${TEI_REPOSITORY}@${teiDigest}`,
    queryCpu, queryMemory, teiCpu, teiMemory, queryPort,
    teiUrl,
    concurrency, minScale, maxScale, timeoutSeconds, ingress,
    secrets: {
      SUPABASE_URL: `${supabaseUrlSecret}:${supabaseUrlVersion}`,
      SUPABASE_ANON_KEY: `${supabaseAnonSecret}:${supabaseAnonVersion}`,
      SUPABASE_SERVICE_ROLE_KEY: `${supabaseServiceRoleSecret}:${supabaseServiceRoleVersion}`,
    },
  };
}

console.log(JSON.stringify({ status: 'predeploy-ok', ...validate() }));
