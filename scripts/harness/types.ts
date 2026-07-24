export interface ServerLifecycleConfig {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly readinessUrl: string;
  readonly readinessTimeoutMs: number;
  readonly pollIntervalMs: number;
  readonly acceptableStatusCodes?: readonly number[];
}

export interface OwnedServerHandle {
  readonly pid: number;
  readonly ownedByHarness: true;
  readonly startedAt: string;
  readonly stdoutLogPath: string;
  readonly stderrLogPath: string;
}

export type ServerStartResult =
  | { readonly ok: true; readonly reason: 'started'; readonly handle: OwnedServerHandle }
  | { readonly ok: true; readonly reason: 'already-healthy-unowned'; readonly detectedUrl: string }
  | { readonly ok: false; readonly reason: 'readiness-timeout'; readonly waitedMs: number }
  | { readonly ok: false; readonly reason: 'port-conflict-unhealthy'; readonly port: number }
  | { readonly ok: false; readonly reason: 'spawn-error'; readonly message: string }
  | { readonly ok: false; readonly reason: 'malformed-readiness-url'; readonly message: string };

export interface ServerStopResult {
  readonly ok: boolean;
  readonly reason: 'stopped' | 'not-owned-refused' | 'already-stopped' | 'stop-timeout';
  readonly portFreeAfterStop: boolean;
}

export interface ScopeValidationResult {
  readonly ok: boolean;
  readonly violations: readonly string[];
  readonly checks: {
    readonly headMatchesExpected: boolean;
    readonly originMatchesHead: boolean;
    readonly baseCommitMatches: boolean;
    readonly changedPathsWithinAllowed: boolean;
    readonly stagedFilesEmpty: boolean;
    readonly untrackedFilesWithinAllowed: boolean;
    readonly prohibitedPathsAbsent: boolean;
    readonly diffCheckClean: boolean;
    readonly stashPolicySatisfied: boolean;
    readonly generatedArtifactsWithinAllowlist: boolean;
    readonly candidateBlobsMatch: boolean | 'not-checked';
    readonly commitMessageMatches: boolean | 'not-checked';
  };
}

export interface LandedCommitValidationResult {
  readonly ok: boolean;
  readonly violations: readonly string[];
  readonly checks: {
    readonly landedCommitExists: boolean;
    readonly parentMatchesBaseCommit: boolean;
    readonly landedFilesWithinAllowed: boolean;
    readonly prohibitedPathsAbsentFromLandedCommit: boolean;
    readonly landedCommitMessageMatches: boolean;
    readonly landedBlobsMatch: boolean | 'not-checked';
    readonly testTotalsMatch: boolean | 'not-checked';
  };
}

export interface WorktreeConfig {
  readonly baseCommit: string;
  readonly worktreeId: string;
  readonly parentDir: string;
  readonly branchName?: string;
  readonly envFilesToCopy?: readonly string[];
  readonly portCount?: number;
}

export interface OwnedWorktreeHandle {
  readonly worktreeId: string;
  readonly path: string;
  readonly branchName: string | null;
  readonly baseCommit: string;
  readonly createdAt: string;
  readonly ownedByHarness: true;
  readonly allocatedPorts: readonly number[];
  readonly metadataPath: string;
}

export type WorktreeCreateResult =
  | { readonly ok: true; readonly reason: 'created'; readonly handle: OwnedWorktreeHandle }
  | { readonly ok: false; readonly reason: 'invalid-worktree-id'; readonly message: string }
  | { readonly ok: false; readonly reason: 'invalid-base-commit'; readonly message: string }
  | { readonly ok: false; readonly reason: 'path-outside-safe-root'; readonly message: string }
  | { readonly ok: false; readonly reason: 'path-collision'; readonly path: string }
  | { readonly ok: false; readonly reason: 'branch-collision'; readonly branchName: string }
  | { readonly ok: false; readonly reason: 'port-allocation-failed'; readonly message: string }
  | { readonly ok: false; readonly reason: 'git-worktree-add-failed'; readonly message: string };

export type WorktreeRemoveResult =
  | { readonly ok: true; readonly reason: 'removed' }
  | { readonly ok: false; readonly reason: 'not-owned-refused' }
  | { readonly ok: false; readonly reason: 'is-main-worktree-refused' }
  | { readonly ok: false; readonly reason: 'dirty-refused' }
  | { readonly ok: false; readonly reason: 'not-found' }
  | { readonly ok: false; readonly reason: 'git-worktree-remove-failed'; readonly message: string };

export interface WorktreeLifecycleOptions {
  readonly repoRoot: string;
  readonly metadataRoot: string;
}

export type WorktreeCliResult =
  | WorktreeCreateResult
  | WorktreeRemoveResult
  | { readonly ok: true; readonly reason: 'listed'; readonly handles: readonly OwnedWorktreeHandle[] }
  | { readonly ok: true; readonly reason: 'pruned'; readonly prunedCount: number; readonly prunedIds: readonly string[] }
  | { readonly ok: false; readonly reason: 'invalid-arguments' | 'operation-failed'; readonly message: string };
