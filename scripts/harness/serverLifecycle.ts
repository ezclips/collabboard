import { createConnection } from 'node:net';
import { mkdtemp, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChildProcess, execFile, spawn } from 'node:child_process';
import type { OwnedServerHandle, ServerLifecycleConfig, ServerStartResult, ServerStopResult } from './types';

interface OwnedProcess {
  readonly child: ChildProcess;
  readonly port: number;
}

const ownedProcesses = new Map<number, OwnedProcess>();
const delay = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function statusIsAcceptable(status: number, acceptable?: readonly number[]): boolean {
  if (acceptable) return acceptable.includes(status);
  return status === 200 || (status >= 300 && status < 400) || status === 404;
}

async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const finish = (value: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(250, () => finish(false));
  });
}

export async function probeReadiness(url: string, timeoutMs: number, pollIntervalMs: number, acceptable?: readonly number[]): Promise<{ ready: boolean; waitedMs: number }> {
  const started = Date.now();
  const deadline = started + Math.max(0, timeoutMs);
  while (true) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(Math.max(1, Math.min(1_000, Math.max(1, deadline - Date.now())))) });
      if (statusIsAcceptable(response.status, acceptable)) return { ready: true, waitedMs: Date.now() - started };
    } catch {
      // A refused connection is expected while an owned process is starting.
    }
    if (Date.now() >= deadline) return { ready: false, waitedMs: Date.now() - started };
    await delay(Math.min(Math.max(1, pollIntervalMs), Math.max(1, deadline - Date.now())));
  }
}

export async function detectPortOwnership(port: number): Promise<{ inUse: boolean; healthyResponse: boolean }> {
  const inUse = await isPortInUse(port);
  if (!inUse) return { inUse: false, healthyResponse: false };
  const readiness = await probeReadiness(`http://127.0.0.1:${port}`, 300, 50);
  return { inUse: true, healthyResponse: readiness.ready };
}

function portFromReadinessUrl(readinessUrl: string): number {
  const parsed = new URL(readinessUrl);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('readiness URL must use HTTP or HTTPS');
  return parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80;
}

export async function startOwnedServer(config: ServerLifecycleConfig): Promise<ServerStartResult> {
  let port: number;
  try {
    port = portFromReadinessUrl(config.readinessUrl);
  } catch (error) {
    return { ok: false, reason: 'malformed-readiness-url', message: error instanceof Error ? error.message : 'invalid readiness URL' };
  }

  if (ownedProcesses.size > 0) return { ok: false, reason: 'spawn-error', message: 'an owned server is already active in this invocation' };
  const existing = await detectPortOwnership(port);
  if (existing.healthyResponse) return { ok: true, reason: 'already-healthy-unowned', detectedUrl: config.readinessUrl };
  if (existing.inUse) return { ok: false, reason: 'port-conflict-unhealthy', port };

  try {
    const logDirectory = await mkdtemp(join(tmpdir(), 'fable-harness-'));
    const stdoutLogPath = join(logDirectory, 'stdout.log');
    const stderrLogPath = join(logDirectory, 'stderr.log');
    const [stdout, stderr] = await Promise.all([open(stdoutLogPath, 'a'), open(stderrLogPath, 'a')]);
    const child = spawn(config.command, [...config.args], {
      cwd: config.cwd,
      env: config.env as NodeJS.ProcessEnv,
      detached: false,
      stdio: ['ignore', stdout.fd, stderr.fd],
      windowsHide: true,
    }) as ChildProcess;
    stdout.close();
    stderr.close();
    if (!child.pid) return { ok: false, reason: 'spawn-error', message: 'spawned process did not provide a PID' };
    const handle: OwnedServerHandle = { pid: child.pid, ownedByHarness: true, startedAt: new Date().toISOString(), stdoutLogPath, stderrLogPath };
    ownedProcesses.set(handle.pid, { child, port });
    const readiness = await probeReadiness(config.readinessUrl, config.readinessTimeoutMs, config.pollIntervalMs, config.acceptableStatusCodes);
    if (readiness.ready) return { ok: true, reason: 'started', handle };
    await stopOwnedServer(handle, Math.min(2_000, config.readinessTimeoutMs));
    return { ok: false, reason: 'readiness-timeout', waitedMs: readiness.waitedMs };
  } catch (error) {
    return { ok: false, reason: 'spawn-error', message: error instanceof Error ? error.message : 'unable to spawn server' };
  }
}

function terminateOwnedProcess(pid: number, child: ChildProcess): Promise<void> {
  if (process.platform !== 'win32') {
    child.kill('SIGTERM');
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => resolve());
  });
}

export async function stopOwnedServer(handle: OwnedServerHandle, timeoutMs: number): Promise<ServerStopResult> {
  if (handle.ownedByHarness !== true) return { ok: false, reason: 'not-owned-refused', portFreeAfterStop: false };
  const owned = ownedProcesses.get(handle.pid);
  if (!owned) return { ok: false, reason: 'not-owned-refused', portFreeAfterStop: false };
  if (owned.child.exitCode !== null || owned.child.killed) {
    ownedProcesses.delete(handle.pid);
    const port = await detectPortOwnership(owned.port);
    return { ok: true, reason: 'already-stopped', portFreeAfterStop: !port.inUse };
  }
  await terminateOwnedProcess(handle.pid, owned.child);
  const deadline = Date.now() + Math.max(0, timeoutMs);
  while (Date.now() <= deadline) {
    const port = await detectPortOwnership(owned.port);
    if (!port.inUse) {
      ownedProcesses.delete(handle.pid);
      return { ok: true, reason: 'stopped', portFreeAfterStop: true };
    }
    await delay(Math.min(50, Math.max(1, deadline - Date.now())));
  }
  return { ok: false, reason: 'stop-timeout', portFreeAfterStop: false };
}
