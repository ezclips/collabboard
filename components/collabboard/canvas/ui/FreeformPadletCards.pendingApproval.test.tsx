import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../../..');
const cards = fs.readFileSync(
  path.join(ROOT, 'components/collabboard/canvas/ui/FreeformPadletCards.tsx'),
  'utf8',
);
const client = fs.readFileSync(
  path.join(ROOT, 'app/dashboard/canvas/[id]/CanvasClient.tsx'),
  'utf8',
);

/**
 * PATCH-367. A mounted render of the 6k-line canvas is impractical (see
 * FreeformPadletCards.researchDropZone.test.tsx), so this guards the wiring of
 * the pending-approval look and its owner-only controls.
 */
describe('FreeformPadletCards pending approval (PATCH-367)', () => {
  it('reads the pending flag from the pure helper and draws the label', () => {
    expect(cards).toContain('isPendingApproval');
    expect(cards).toContain('PENDING_LABEL');
    expect(cards).toMatch(/const pendingApproval = isPendingApproval\(padlet\.metadata\)/);
    expect(cards).toContain('data-pending-approval="true"');
  });

  it('marks a pending post with a dashed outline that keeps its size', () => {
    expect(cards).toMatch(/outline: pendingApproval \? '2px dashed/);
    expect(cards).toContain('outlineOffset');
  });

  it('gates the buttons on the owner flag and marks them', () => {
    expect(cards).toContain('canApproveGuestPosts');
    expect(cards).toMatch(/canApproveGuestPosts \? \(/);
    expect(cards).toContain('data-approve-post="true"');
    expect(cards).toContain('data-decline-post="true"');
  });

  it('asks inline before declining (a confirm button deletes)', () => {
    expect(cards).toContain('declineConfirmId === padlet.id');
    expect(cards).toContain('data-decline-post-confirm="true"');
    expect(cards).toMatch(/data-decline-post-confirm="true"[\s\S]{0,600}declinePendingPost\(padlet\)/);
    expect(cards).toMatch(/data-decline-post="true"[\s\S]{0,600}setDeclineConfirmId\(padlet\.id\)/);
    expect(cards).toContain('deletePadletById(padlet.id)');
  });
});

describe('PATCH-367 Addendum 1: approve writes straight through', () => {
  const approveFn = client.slice(
    client.indexOf('const approveGuestPostNow'),
    client.indexOf('}, [padlets, padletMetaSaver, showSaveFailureToast]);'),
  );

  it('FreeformPadletCards hands the approved metadata to CanvasClient', () => {
    expect(cards).toContain('approvedMetadata(padlet.metadata');
    expect(cards).toContain('onApproveGuestPost?.(padlet.id, nextMetadata)');
    expect(cards).toContain('onApproveGuestPost');
  });

  it('CanvasClient calls the direct command once, with no debounce', () => {
    expect(approveFn.length).toBeGreaterThan(0);
    expect(approveFn).toContain('createUpdatePostMetadataCommand(createPostsRepository())');
    expect(approveFn).toContain('updatePostMetadata({ postId: padletId, metadata: approvedMeta }');
    expect(approveFn).toContain('padletMetaSaver.cancel(padletId)');
  });

  it('never marks the post locally modified (that would skip the approval echo)', () => {
    expect(approveFn).not.toContain('markPadletLocallyModified');
    expect(approveFn).not.toContain('savePadletMetaNow');
  });

  it('restores the previous metadata and toasts on failure', () => {
    expect(approveFn).toContain('showSaveFailureToast()');
    expect(approveFn).toContain('metadata: previous');
  });
});
