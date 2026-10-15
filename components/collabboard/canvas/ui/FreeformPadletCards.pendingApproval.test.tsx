import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../../..');
const cards = fs.readFileSync(
  path.join(ROOT, 'components/collabboard/canvas/ui/FreeformPadletCards.tsx'),
  'utf8',
);
const bar = fs.readFileSync(
  path.join(ROOT, 'components/collabboard/canvas/ui/PendingApprovalBar.tsx'),
  'utf8',
);
const client = fs.readFileSync(
  path.join(ROOT, 'app/dashboard/canvas/[id]/CanvasClient.tsx'),
  'utf8',
);

/**
 * PATCH-370. A mounted render of the 6k-line canvas is impractical (see
 * FreeformPadletCards.researchDropZone.test.tsx), so this guards the wiring of
 * the pending-approval look, now via the shared PendingApprovalBar.
 */
describe('FreeformPadletCards pending approval (PATCH-370)', () => {
  it('marks a pending post with a dashed outline and the shared bar', () => {
    expect(cards).toMatch(/const pendingApproval = isPendingApproval\(padlet\.metadata\)/);
    expect(cards).toMatch(/outline: pendingApproval \? '2px dashed/);
    expect(cards).toContain('outlineOffset');
    expect(cards).toMatch(/<PendingApprovalBar/);
  });

  it('shows the bar only for the owner and wires approve/decline', () => {
    expect(cards).toMatch(/canApprove=\{canApproveGuestPosts\}/);
    expect(cards).toMatch(/onApprove=\{\(\) => approvePendingPost\(padlet\)\}/);
    expect(cards).toMatch(/onDecline=\{\(\) => declinePendingPost\(padlet\)\}/);
  });

  it('the shared bar carries the data hooks and the inline confirm', () => {
    expect(bar).toContain('data-pending-approval="true"');
    expect(bar).toContain('data-approve-post="true"');
    expect(bar).toContain('data-decline-post="true"');
    expect(bar).toContain('data-decline-post-confirm="true"');
  });

  it('approves through CanvasClient and declines through delete', () => {
    expect(cards).toContain('approvedMetadata(padlet.metadata');
    expect(cards).toContain('deletePadletById(padlet.id)');
    expect(client).toContain('onApproveGuestPost={approveGuestPostNow}');
  });
});
