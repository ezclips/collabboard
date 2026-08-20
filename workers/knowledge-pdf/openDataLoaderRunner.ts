import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const OPENDATALOADER_PDF_VERSION = '2.5.0' as const;
export const OPENDATALOADER_PARSER_NAME = 'opendataloader-pdf' as const;
export const DEFAULT_OPENDATALOADER_TIMEOUT_MS = 120_000;
export const MAX_PROCESS_DIAGNOSTIC_LENGTH = 8_000;

export interface OpenDataLoaderRunConfig {
  readonly javaBin: string;
  readonly jarPath: string;
  readonly timeoutMs: number;
}

export interface OpenDataLoaderRunInput {
  readonly inputPath: string;
  readonly outputDir: string;
}

export interface OpenDataLoaderRunResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly elapsedMs: number;
}

export interface OpenDataLoaderParserConfiguration {
  readonly name: typeof OPENDATALOADER_PARSER_NAME;
  readonly version: typeof OPENDATALOADER_PDF_VERSION;
  readonly mode: 'native-local';
  readonly format: readonly ['json', 'markdown'];
  readonly quiet: true;
  readonly javaHeadless: true;
  readonly ocr: false;
  readonly hybrid: false;
  readonly externalAi: false;
}

export const OPENDATALOADER_PARSER_CONFIGURATION: OpenDataLoaderParserConfiguration = {
  name: OPENDATALOADER_PARSER_NAME,
  version: OPENDATALOADER_PDF_VERSION,
  mode: 'native-local',
  format: ['json', 'markdown'],
  quiet: true,
  javaHeadless: true,
  ocr: false,
  hybrid: false,
  externalAi: false,
};

export function buildOpenDataLoaderArgs(
  jarPath: string,
  inputPath: string,
  outputDir: string,
): readonly string[] {
  return [
    '-Djava.awt.headless=true',
    '-jar',
    jarPath,
    inputPath,
    '--format',
    'json,markdown',
    '--output-dir',
    outputDir,
    '--quiet',
  ];
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function openDataLoaderOptionsHash(
  configuration: OpenDataLoaderParserConfiguration = OPENDATALOADER_PARSER_CONFIGURATION,
): string {
  return createHash('sha256').update(stableStringify(configuration), 'utf8').digest('hex');
}

export function boundedDiagnostic(value: string, maxLength = MAX_PROCESS_DIAGNOSTIC_LENGTH): string {
  const oneLine = value.replace(/[\r\n\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim();
  return oneLine.length <= maxLength ? oneLine : `${oneLine.slice(0, maxLength)}…`;
}

export class OpenDataLoaderProcessError extends Error {
  readonly timedOut: boolean;
  readonly diagnostics: string;

  constructor(message: string, options: { readonly timedOut?: boolean; readonly diagnostics?: string } = {}) {
    super(message);
    this.name = 'OpenDataLoaderProcessError';
    this.timedOut = options.timedOut ?? false;
    this.diagnostics = boundedDiagnostic(options.diagnostics ?? '');
  }
}

export async function runOpenDataLoader(
  config: OpenDataLoaderRunConfig,
  input: OpenDataLoaderRunInput,
  spawnProcess: typeof spawn = spawn,
): Promise<OpenDataLoaderRunResult> {
  const args = buildOpenDataLoaderArgs(config.jarPath, input.inputPath, input.outputDir);
  const startedAt = Date.now();

  return new Promise<OpenDataLoaderRunResult>((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawnProcess(config.javaBin, args, {
        cwd: input.outputDir,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error: unknown) {
      reject(error);
      return;
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    let killTimer: NodeJS.Timeout | undefined;

    const appendBounded = (current: string, chunk: Buffer | string): string => {
      if (current.length >= MAX_PROCESS_DIAGNOSTIC_LENGTH) return current;
      return `${current}${chunk.toString('utf8')}`.slice(0, MAX_PROCESS_DIAGNOSTIC_LENGTH);
    };

    const terminate = (): void => {
      if (settled) return;
      timedOut = true;
      child.kill('SIGTERM');
      killTimer = setTimeout(() => {
        if (!settled) child.kill('SIGKILL');
      }, 2_000);
    };

    const timeoutTimer = setTimeout(terminate, config.timeoutMs);

    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout = appendBounded(stdout, chunk);
    });
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr = appendBounded(stderr, chunk);
    });
    child.once('error', (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      reject(error);
    });
    child.once('close', (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      const result: OpenDataLoaderRunResult = {
        exitCode,
        signal,
        stdout: boundedDiagnostic(stdout),
        stderr: boundedDiagnostic(stderr),
        timedOut,
        elapsedMs: Date.now() - startedAt,
      };
      if (timedOut) {
        reject(
          new OpenDataLoaderProcessError(
            `OpenDataLoader timed out after ${config.timeoutMs}ms`,
            { timedOut: true, diagnostics: result.stderr || result.stdout },
          ),
        );
        return;
      }
      if (exitCode !== 0) {
        reject(
          new OpenDataLoaderProcessError(
            `OpenDataLoader exited with code ${exitCode ?? 'unknown'}`,
            { diagnostics: result.stderr || result.stdout },
          ),
        );
        return;
      }
      resolve(result);
    });
  });
}

export function assertWorkerRuntimePath(value: string | undefined, name: string): string {
  if (!value || !path.isAbsolute(value)) {
    throw new Error(`${name} must be configured as an absolute path`);
  }
  if (!fs.existsSync(value)) throw new Error(`${name} is unavailable at the configured path`);
  return value;
}
