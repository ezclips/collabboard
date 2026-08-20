import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import {
  buildOpenDataLoaderArgs,
  boundedDiagnostic,
  openDataLoaderOptionsHash,
  OPENDATALOADER_PARSER_CONFIGURATION,
  runOpenDataLoader,
} from './openDataLoaderRunner';

class FakeChild extends EventEmitter {
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  killed = false;

  kill(): boolean {
    this.killed = true;
    this.emit('close', null, 'SIGTERM');
    return true;
  }
}

describe('OpenDataLoader process boundary', () => {
  it('uses an argument array with deterministic native/local options', () => {
    expect(buildOpenDataLoaderArgs('C:/odl.jar', 'C:/source.pdf', 'C:/out')).toEqual([
      '-Djava.awt.headless=true',
      '-jar',
      'C:/odl.jar',
      'C:/source.pdf',
      '--format',
      'json,markdown',
      '--output-dir',
      'C:/out',
      '--quiet',
    ]);
    expect(openDataLoaderOptionsHash()).toBe(openDataLoaderOptionsHash({ ...OPENDATALOADER_PARSER_CONFIGURATION }));
    expect(openDataLoaderOptionsHash()).toMatch(/^[a-f0-9]{64}$/);
  });

  it('bounds process diagnostics', () => {
    expect(boundedDiagnostic('line one\nline two')).toBe('line one line two');
    expect(boundedDiagnostic('x'.repeat(20), 8)).toBe('xxxxxxxx…');
  });

  it('kills and reports a timed-out child process', async () => {
    let child: FakeChild | undefined;
    const spawnProcess = (() => {
      child = new FakeChild();
      return child;
    }) as unknown as typeof import('node:child_process').spawn;

    await expect(
      runOpenDataLoader(
        { javaBin: 'java.exe', jarPath: 'odl.jar', timeoutMs: 5 },
        { inputPath: 'source.pdf', outputDir: '.' },
        spawnProcess,
      ),
    ).rejects.toMatchObject({ timedOut: true });
    expect(child?.killed).toBe(true);
  });
});
