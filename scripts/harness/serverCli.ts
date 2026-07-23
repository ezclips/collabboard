import { startOwnedServer, detectPortOwnership } from './serverLifecycle';

function configFromEnvironment() {
  return {
    command: process.env.HARNESS_COMMAND ?? 'npm', args: (process.env.HARNESS_ARGS ?? 'run dev').split(' ').filter(Boolean), cwd: process.cwd(), env: process.env,
    readinessUrl: process.env.HARNESS_READINESS_URL ?? 'http://127.0.0.1:3000', readinessTimeoutMs: Number(process.env.HARNESS_READINESS_TIMEOUT_MS ?? 30_000), pollIntervalMs: Number(process.env.HARNESS_POLL_INTERVAL_MS ?? 250),
  };
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === 'status') {
    const url = new URL(configFromEnvironment().readinessUrl);
    const result = await detectPortOwnership(Number(url.port || 80));
    process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
    return;
  }
  if (command === 'start') {
    const result = await startOwnedServer(configFromEnvironment());
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }
  if (command === 'stop') {
    process.stdout.write(`${JSON.stringify({ ok: false, reason: 'not-owned-refused', portFreeAfterStop: false })}\n`);
    process.exitCode = 1;
    return;
  }
  throw new Error('usage: serverCli <start|stop|status>');
}

main().catch((error) => { process.stdout.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'unknown error' })}\n`); process.exitCode = 1; });
