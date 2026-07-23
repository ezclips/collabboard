import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import type { PatchManifest } from './manifestSchema';
import type { ScopeValidationResult } from './types';

const execFileAsync = promisify(execFile);
export interface CommandResult { readonly code: number; readonly stdout: string; readonly stderr: string }
export type CommandRunner = (command: string, args: readonly string[], cwd: string) => Promise<CommandResult>;
export interface ScopeValidationOptions {
  readonly expectedHead?: string;
  readonly repoRoot: string;
  readonly commandRunner?: CommandRunner;
  readonly fileExists?: (path: string) => boolean;
  readonly generatedArtifactCandidates?: readonly string[];
}

const defaultRunner: CommandRunner = async (command, args, cwd) => {
  try {
    const result = await execFileAsync(command, [...args], { cwd, windowsHide: true });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? 1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' };
  }
};

const lines = (value: string) => value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
function matches(path: string, rule: string): boolean {
  let expression = '';
  for (let index = 0; index < rule.length; index += 1) {
    if (rule[index] === '*' && rule[index + 1] === '*') { expression += '.*'; index += 1; }
    else if (rule[index] === '*') expression += '[^/]*';
    else expression += rule[index].replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
  }
  return new RegExp(`^${expression}$`).test(path);
}
const isAllowed = (path: string, rules: readonly string[]) => rules.some((rule) => matches(path, rule));

export async function validateScope(manifest: PatchManifest, options: ScopeValidationOptions): Promise<ScopeValidationResult> {
  const run = options.commandRunner ?? defaultRunner;
  const execute = (args: readonly string[]) => run('git', args, options.repoRoot);
  const [head, origin, diff, staged, untracked, diffCheck, stash, commit] = await Promise.all([
    execute(['rev-parse', 'HEAD']), execute(['rev-parse', 'origin/main']), execute(['diff', '--name-only']),
    execute(['diff', '--cached', '--name-only']), execute(['ls-files', '--others', '--exclude-standard']),
    execute(['diff', '--check']), execute(['stash', 'list']), execute(['log', '-1', '--format=%s']),
  ]);
  const headValue = head.stdout.trim();
  const changedPaths = lines(diff.stdout);
  const stagedPaths = lines(staged.stdout);
  const untrackedPaths = lines(untracked.stdout);
  const allPaths = [...changedPaths, ...stagedPaths, ...untrackedPaths];
  const candidatePaths = options.generatedArtifactCandidates ?? ['test-results', 'playwright-report', '.next/trace'];
  const exists = options.fileExists ?? ((path: string) => existsSync(join(options.repoRoot, path)));
  const generatedPaths = candidatePaths.filter(exists);
  const expectedHead = options.expectedHead ?? manifest.baseCommit;
  const checks = {
    headMatchesExpected: head.code === 0 && headValue === expectedHead,
    originMatchesHead: origin.code === 0 && origin.stdout.trim() === headValue,
    baseCommitMatches: head.code === 0 && headValue === manifest.baseCommit,
    changedPathsWithinAllowed: diff.code === 0 && changedPaths.every((path) => isAllowed(path, manifest.allowedFiles)),
    stagedFilesEmpty: staged.code === 0 && stagedPaths.length === 0,
    untrackedFilesWithinAllowed: untracked.code === 0 && untrackedPaths.every((path) => isAllowed(path, manifest.allowedUntrackedFiles)),
    prohibitedPathsAbsent: allPaths.every((path) => !isAllowed(path, manifest.prohibitedFiles)),
    diffCheckClean: diffCheck.code === 0 && !diffCheck.stdout.trim(),
    stashPolicySatisfied: stash.code === 0 && (manifest.stashPolicy === 'no-policy' || (manifest.stashPolicy === 'must-be-empty' && !stash.stdout.trim()) || (manifest.stashPolicy === 'must-be-unchanged' && Boolean(stash.stdout.trim()))),
    generatedArtifactsWithinAllowlist: generatedPaths.every((path) => isAllowed(path, manifest.generatedArtifactPaths)),
    candidateBlobsMatch: manifest.candidateBlobs ? true : 'not-checked' as const,
    commitMessageMatches: headValue === manifest.baseCommit ? 'not-checked' as const : commit.code === 0 && commit.stdout.trim() === manifest.exactCommitMessage,
  };
  if (manifest.candidateBlobs) {
    for (const [path, expected] of Object.entries(manifest.candidateBlobs)) {
      const actual = await execute(['hash-object', path]);
      if (actual.code !== 0 || actual.stdout.trim() !== expected) checks.candidateBlobsMatch = false;
    }
  }
  const labels: Record<keyof typeof checks, string> = {
    headMatchesExpected: 'HEAD does not match the expected commit', originMatchesHead: 'origin/main does not match HEAD', baseCommitMatches: 'HEAD does not match manifest baseCommit', changedPathsWithinAllowed: 'changed paths exceed the manifest allowlist', stagedFilesEmpty: 'staged files are present', untrackedFilesWithinAllowed: 'untracked paths exceed the manifest allowlist', prohibitedPathsAbsent: 'a prohibited path is present', diffCheckClean: 'git diff --check reported whitespace errors', stashPolicySatisfied: 'stash policy is not satisfied', generatedArtifactsWithinAllowlist: 'generated artifacts exceed the allowlist', candidateBlobsMatch: 'candidate blob hashes do not match', commitMessageMatches: 'commit message does not match',
  };
  const violations = (Object.entries(checks) as Array<[keyof typeof checks, boolean | 'not-checked']>).filter(([, value]) => value === false).map(([key]) => labels[key]);
  return { ok: violations.length === 0, violations, checks };
}
