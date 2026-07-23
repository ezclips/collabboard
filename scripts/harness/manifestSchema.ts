import { z } from 'zod';

const repoPath = z.string().min(1).refine(
  (value) => !value.startsWith('/') && !value.startsWith('\\') && !/^[A-Za-z]:/.test(value) && !value.split(/[\\/]/).includes('..'),
  'must be a non-parent-traversing repository-relative path',
);

export const patchManifestSchema = z.object({
  patchId: z.string().regex(/^PATCH-\d{3,4}$/),
  baseCommit: z.string().regex(/^[0-9a-f]{40}$/),
  allowedFiles: z.array(repoPath),
  prohibitedFiles: z.array(repoPath).default([]),
  allowedUntrackedFiles: z.array(repoPath).default([]),
  generatedArtifactPaths: z.array(repoPath).default(['test-results', 'playwright-report', '.next/trace']),
  stashPolicy: z.enum(['must-be-empty', 'must-be-unchanged', 'no-policy']),
  requiredCommands: z.array(z.object({
    label: z.string().min(1),
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    expectedExitCode: z.number().int().default(0),
  })),
  expectedTestTotals: z.object({
    unit: z.object({ tests: z.number().int().nonnegative(), files: z.number().int().nonnegative() }).optional(),
    e2e: z.record(z.string(), z.string()).optional(),
  }).optional(),
  exactCommitMessage: z.string(),
  serverConfig: z.object({
    readinessUrl: z.string(),
    readinessTimeoutMs: z.number().positive(),
    pollIntervalMs: z.number().positive(),
  }).optional(),
  candidateBlobs: z.record(repoPath, z.string().regex(/^[0-9a-f]{40}$/)).optional(),
});

export type PatchManifest = z.infer<typeof patchManifestSchema>;
