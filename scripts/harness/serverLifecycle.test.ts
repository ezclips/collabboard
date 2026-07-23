import { createServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectPortOwnership, probeReadiness, startOwnedServer, stopOwnedServer } from './serverLifecycle';

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const address = server.address(); server.close(); if (typeof address === 'object' && address) resolve(address.port); else reject(new Error('missing port')); });
  });
}

const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'tinyServer.mjs');

describe('server lifecycle', () => {
  it('starts, probes, and stops an owned fixture', async () => {
    const port = await freePort();
    const result = await startOwnedServer({ command: process.execPath, args: [fixture], cwd: process.cwd(), env: { ...process.env, HARNESS_TEST_PORT: String(port) }, readinessUrl: `http://127.0.0.1:${port}`, readinessTimeoutMs: 3_000, pollIntervalMs: 20 });
    expect(result).toMatchObject({ ok: true, reason: 'started' });
    if (!result.ok || result.reason !== 'started') return;
    expect(result.handle.ownedByHarness).toBe(true);
    expect(await stopOwnedServer(result.handle, 3_000)).toMatchObject({ ok: true, portFreeAfterStop: true });
  });

  it('bounds a readiness timeout and refuses malformed URLs before spawning', async () => {
    const timed = await probeReadiness('http://127.0.0.1:9', 50, 10);
    expect(timed.ready).toBe(false);
    expect(timed.waitedMs).toBeLessThan(300);
    const malformed = await startOwnedServer({ command: process.execPath, args: [fixture], cwd: process.cwd(), env: process.env, readinessUrl: 'not a url', readinessTimeoutMs: 50, pollIntervalMs: 10 });
    expect(malformed).toMatchObject({ ok: false, reason: 'malformed-readiness-url' });
  });

  it('detects a healthy existing server and refuses duplicate startup', async () => {
    const port = await freePort();
    const server = createHttpServer((_, response) => response.end());
    await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
    expect(await detectPortOwnership(port)).toMatchObject({ inUse: true, healthyResponse: true });
    const result = await startOwnedServer({ command: process.execPath, args: [fixture], cwd: process.cwd(), env: process.env, readinessUrl: `http://127.0.0.1:${port}`, readinessTimeoutMs: 50, pollIntervalMs: 10 });
    expect(result).toMatchObject({ ok: true, reason: 'already-healthy-unowned' });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
