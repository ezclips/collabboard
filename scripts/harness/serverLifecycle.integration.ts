import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { startOwnedServer, stopOwnedServer, detectPortOwnership } from './serverLifecycle';

const port = await new Promise<number>((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const address = server.address(); if (typeof address === 'object' && address) resolve(address.port); else reject(new Error('no ephemeral port')); server.close(); });
});
const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'tinyServer.mjs');
const result = await startOwnedServer({ command: process.execPath, args: [fixture], cwd: process.cwd(), env: { ...process.env, HARNESS_TEST_PORT: String(port) }, readinessUrl: `http://127.0.0.1:${port}`, readinessTimeoutMs: 5_000, pollIntervalMs: 50 });
assert.equal(result.ok, true);
assert.equal(result.reason, 'started');
if (!result.ok || result.reason !== 'started') throw new Error('fixture failed to start');
const stopped = await stopOwnedServer(result.handle, 5_000);
assert.equal(stopped.ok, true);
assert.equal(stopped.portFreeAfterStop, true);
assert.equal((await detectPortOwnership(port)).inUse, false);
process.stdout.write(`${JSON.stringify({ ok: true, port, stop: stopped })}\n`);
