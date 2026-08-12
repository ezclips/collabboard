import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const FREEFORM = 'components/collabboard/canvas/ui/FreeformPadletCards.tsx';
const CANVAS = 'app/dashboard/canvas/[id]/CanvasClient.tsx';
const POPUP = 'components/collabboard/editors/CommentPopup.tsx';
const LINK_SAFETY = 'components/collabboard/commentLinkSafety.ts';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('Image comments — canonical Comment UI v1 migration', () => {
  it('routes every live Image comment entry point through CommentPopup', () => {
    const freeform = read(FREEFORM);
    const canvas = read(CANVAS);

    expect(freeform).toContain("import CommentPopup from '@/components/collabboard/editors/CommentPopup';");
    expect(canvas).toContain("import CommentPopup from '@/components/collabboard/editors/CommentPopup';");
    expect(freeform).toContain('cardCommentPopupPadletId === padlet.id && !imageToolbarPadletId');
    expect(freeform).toContain('activeImageToolbarPadlet && cardCommentPopupPadletId === activeImageToolbarPadlet.id');
    expect(canvas).toContain('cardCommentPopupPadletId === activeImageToolbarPadlet.id');
    expect(freeform.match(/<CommentPopup/g)?.length).toBeGreaterThanOrEqual(3);
    expect(canvas.match(/<CommentPopup/g)?.length).toBeGreaterThanOrEqual(1);
});
  it('removes Image-local rows, action rails, composers, and popovers', () => {
    const freeform = read(FREEFORM);
    const canvas = read(CANVAS);
    expect(freeform).not.toContain('import CommentList');
    expect(freeform).not.toContain('SITE_A_PROFILE');
    for (const source of [freeform, canvas]) {
      expect(source).toContain('enableCanonicalSelectionStyling');
      expect(source).not.toMatch(/activeImageToolbarPadlet[\s\S]{0,12000}<textarea/);
      expect(source).not.toMatch(/activeImageToolbarPadlet[\s\S]{0,12000}title="Color"/);
      expect(source).not.toMatch(/activeImageToolbarPadlet[\s\S]{0,12000}title="Delete"/);
    }
  });

  it('keeps Image storage and legacy comment records intact through thin callbacks', () => {
    const freeform = read(FREEFORM);
    const canvas = read(CANVAS);
    for (const source of [freeform, canvas]) {
      expect(source).toContain('metadata?.detachedComments');
      expect(source).toContain('detachedComments: nextComments');
      expect(source).toContain('comments={cardCommentList}');
      expect(source).toContain('onEditComment');
      expect(source).toContain('onRemoveComment');
      expect(source).toContain('onCommentColor');
    }
  });

  it('passes canonical title, badge, composer, and interaction-island wiring to Image', () => {
    const source = read(FREEFORM) + read(CANVAS);
    expect(source).toContain('commentTitle={typeof');
    expect(source).toContain('onCommentTitleChange');
    expect(source).toContain('onCommentTitleStyleChange');
    expect(source).toContain('onBadgeColorChange');
    expect(source).toContain('onSubmit={async (commentText)');
    expect(source).toContain('onOpenChange={(open)');
    expect(source).toContain('onClick={(e) => e.stopPropagation()}');
    expect(source).toContain('onMouseDown={(e) => e.stopPropagation()}');
  });

  it('inherits the complete canonical capability surface instead of recreating it', () => {
    const popup = read(POPUP);
    const linkSafety = read(LINK_SAFETY);
    for (const capability of [
      'Add a comment...',
      'aria-label="Send"',
      'enableCanonicalSelectionStyling',
      'Style comment title',
      'applySelectedStyle',
      'applySelectedStrikethrough',
      'handleApplyLink',
      'TextStylePopup',
      'useAnchoredPopover',
      'onRemoveComment',
    ]) {
      expect(popup).toContain(capability);
    }
    expect(linkSafety).toContain("'_blank'");
    expect(linkSafety).toContain("'noopener,noreferrer'");
  });

  it('keeps the focused canonical behavior suites as the executable Image contract', () => {
    for (const path of [
      'components/collabboard/editors/CommentPopup.clipartContract.test.tsx',
      'components/collabboard/editors/CommentPopup.colorAndLink.test.tsx',
      'components/collabboard/editors/CommentPopup.colorHighlightReactivity.test.tsx',
      'components/collabboard/editors/CommentPopup.heightDiscipline.test.tsx',
      'components/collabboard/editors/useAnchoredPopover.test.tsx',
      'components/collabboard/commentLinkSafety.test.tsx',
    ]) {
      expect(fs.existsSync(path)).toBe(true);
    }
  });
});
