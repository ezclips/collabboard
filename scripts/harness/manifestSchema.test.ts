import { describe, expect, it } from 'vitest';
import { patchManifestSchema } from './manifestSchema';

const manifest = {
  patchId: 'PATCH-105', baseCommit: 'a'.repeat(40), allowedFiles: ['scripts/harness/types.ts'], stashPolicy: 'must-be-empty', requiredCommands: [{ label: 'unit', command: 'npx' }], exactCommitMessage: 'message',
};

describe('patchManifestSchema', () => {
  it('parses a valid JSON-serializable manifest with defaults', () => {
    const parsed = patchManifestSchema.parse(manifest);
    expect(JSON.parse(JSON.stringify(parsed))).toMatchObject({ patchId: 'PATCH-105', prohibitedFiles: [], allowedUntrackedFiles: [] });
  });

  it.each([
    ['patchId', 'PATCH-XX'], ['baseCommit', 'bad'], ['allowedFiles', ['../escape.ts']], ['stashPolicy', 'ignore'],
  ])('rejects an invalid %s', (field, value) => {
    expect(() => patchManifestSchema.parse({ ...manifest, [field]: value })).toThrow();
  });
});
