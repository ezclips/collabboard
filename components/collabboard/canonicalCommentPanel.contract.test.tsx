import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const FREEFORM_PATH = 'components/collabboard/canvas/ui/FreeformPadletCards.tsx';
const DRAFT_PATH = 'components/collabboard/editors/ClipartCardDraftModal.tsx';
const POPUP_PATH = 'components/collabboard/editors/CommentPopup.tsx';
const CONTRACT_PATH = '.fable5/architecture/COMMENT_UI_CONTRACT_V1.md';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('canonical normal comment UI v1', () => {
  it('keeps both live Clipart entry points on the same CommentPopup', () => {
    const freeform = read(FREEFORM_PATH);
    const draft = read(DRAFT_PATH);

    expect(freeform).toContain("import CommentPopup from '@/components/collabboard/editors/CommentPopup';");
    expect(draft).toContain("import CommentPopup from '@/components/collabboard/editors/CommentPopup';");
    expect(freeform).toContain('Card Comments Popup - Right side');
    expect(freeform).toContain('enableCanonicalSelectionStyling');
    expect(draft).toContain('<CommentPopup');
  });

  it('prevents a local Clipart comment implementation from returning', () => {
    const source = read(FREEFORM_PATH);
    const start = source.indexOf('Card Comments Popup - Right side');
    const end = source.indexOf('Render Standalone Comment Marker', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const clipartPanel = source.slice(start, end);

    expect(clipartPanel).toContain('<CommentPopup');
    expect(clipartPanel).not.toContain('<textarea');
    expect(clipartPanel).not.toContain('TextStylePopup');
    expect(clipartPanel).not.toContain('title="Edit"');
    expect(clipartPanel).not.toContain('title="Color"');
    expect(clipartPanel).not.toContain('title="Link"');
    expect(clipartPanel).not.toContain('Edit2');
  });

  it('keeps the canonical component and shared helpers as the ownership boundary', () => {
    const popup = read(POPUP_PATH);
    expect(popup).toContain("import TextStylePopup from './TextStylePopup';");
    expect(popup).toContain("from './useAnchoredPopover'");
    expect(popup).toContain("from '../commentLinkSafety'");
    expect(popup).toContain('data-comment-panel="true"');
  });

  it('keeps the migration status explicit and distinguishes Note storage systems', () => {
    const contract = read(CONTRACT_PATH);
    expect(contract).toContain('CANONICAL NORMAL COMMENT UI: **FROZEN**');
    expect(contract).toContain('CANONICAL:');
    expect(contract).toContain('- Clipart');
    expect(contract).toContain('- Image');
    expect(contract).toContain('- Note — normal/detached comments');
    expect(contract).toContain('- Note — anchored/highlighted threads');
    expect(contract).toContain('NOT YET MIGRATED:');
    expect(contract).toContain('COMMENT UI CONTRACT UNLOCK');
    for (const path of [
      'noteDetachedCommentUIContract.test.tsx',
      'CommentPopup.clipartContract.test.tsx',
      'CommentPopup.colorAndLink.test.tsx',
      'CommentPopup.colorHighlightReactivity.test.tsx',
      'CommentPopup.heightDiscipline.test.tsx',
      'useAnchoredPopover.test.tsx',
      'commentLinkSafety.test.tsx',
    ]) {
      expect(contract).toContain(path);
    }
  });
});
