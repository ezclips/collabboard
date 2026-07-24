import { z } from 'zod';

const parsedTotalsSchema = z.object({
  tests: z.number().int().nonnegative(),
  files: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative().optional(),
  failed: z.number().int().nonnegative().optional(),
  skipped: z.number().int().nonnegative().optional(),
  durationMs: z.number().nonnegative().optional(),
  parseError: z.string().optional(),
});

export const evidenceBundleSchema = z.object({
  ok: z.boolean(),
  patchId: z.string(),
  startedAt: z.string(),
  finishedAt: z.string(),
  totalDurationMs: z.number().nonnegative(),
  commands: z.array(z.object({
    label: z.string(),
    command: z.string(),
    args: z.array(z.string()),
    exitCode: z.number().int(),
    expectedExitCode: z.number().int(),
    ok: z.boolean(),
    timedOut: z.boolean(),
    durationMs: z.number().nonnegative(),
    stdoutLogPath: z.string(),
    stderrLogPath: z.string(),
    parsedTestTotals: parsedTotalsSchema.nullable(),
    startedAt: z.string(),
    finishedAt: z.string(),
  })),
  stoppedEarly: z.boolean(),
  parsedTestTotals: z.object({
    tests: z.number().int().nonnegative(),
    files: z.number().int().nonnegative(),
  }).nullable(),
  expectedTestTotalsMatch: z.union([z.boolean(), z.literal('not-checked')]),
  worktree: z.object({ used: z.boolean(), worktreeId: z.string().nullable() }),
  serverManaged: z.object({ used: z.boolean(), started: z.boolean() }),
  cleanup: z.object({
    ok: z.boolean(),
    worktreeRemoveResult: z.unknown().nullable(),
    serverStopResult: z.unknown().nullable(),
    errors: z.array(z.string()),
  }),
  evidenceBundlePath: z.string(),
});

export type ParsedEvidenceBundle = z.infer<typeof evidenceBundleSchema>;
