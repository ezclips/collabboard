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
