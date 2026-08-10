import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const canvasClientSrc = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
const freeformSrc = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
const canvasModalsSrc = read('components/collabboard/canvas/ui/CanvasModals.tsx');
const contextMenuSrc = read('components/collabboard/canvas/ui/CanvasContextMenu.tsx');

function slice(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  if (start === -1) throw new Error(`marker not found: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end === -1) throw new Error(`end marker not found after start: ${endMarker}`);
  return source.slice(start, end);
}

describe('central route (openPadletInTypeEditor): Document branch', () => {
  // §36: per-type dispatch moved to the unguarded core; the guard stayed in the wrapper.
  const body = slice(canvasClientSrc, 'const executePadletTypeEditor = (post: Padlet) => {', '\n  };');

  it('the exact-Document branch uses the shared destination helper (PATCH-149B2-ii: via requestOpenDocument)', () => {
    const wrapper = slice(canvasClientSrc, 'const openPadletInTypeEditor = (post: Padlet) => {', '\n  };');
    expect(wrapper).toContain("post.type === 'card'");
    expect(wrapper).toContain('selectDocumentModalDestination(post, canUseFreeformEditButton)');
    expect(wrapper).toContain('requestOpenDocument(post, destination)');
  });

  it('the clipart branch is unchanged -- still opens ClipartDraftModal/CardViewer via selectCardModalRoute', () => {
    expect(body).toContain("post.type === 'card' && post.metadata?.svgUrl) {");
    expect(body).toContain('selectCardModalRoute(canUseFreeformEditButton)');
    expect(body).toContain('setIsClipartDraftModalOpen(true)');
  });

  it('Notes and other non-Document posts retain the existing fallthrough', () => {
    expect(body).toContain('else setIsNoteEditorOpen(true);');
    expect(body).toContain("if (post.type === 'todo') setIsTodoEditorOpen(true);");
  });

  it('the Document branch does not open CardEditor', () => {
    const documentBranch = slice(body, "post.type === 'card') {", '\n    }');
    expect(documentBranch).not.toContain('setIsCardEditorOpen');
    expect(documentBranch).not.toContain('setIsCardViewerOpen');
  });

  it('the Document branch does not open NoteEditor', () => {
    const documentBranch = slice(body, "post.type === 'card') {", '\n    }');
    expect(documentBranch).not.toContain('setIsNoteEditorOpen');
  });

  it('the direct-link (?openPadlet=) path reaches this same function', () => {
    expect(canvasClientSrc).toContain('openPadletInTypeEditorRef.current = openPadletInTypeEditor;');
    expect(canvasClientSrc).toContain('openPadletInTypeEditorRef.current(target);');
  });
});

describe('Columns onOpenPost: Document branch', () => {
  const body = slice(canvasClientSrc, 'onAddGlobalSection={() => handleAddSection()}', 'onDeletePost={(post: Padlet) => deletePadletById(post.id)}');

  it('uses the shared Document destination and no longer opens NoteEditor unconditionally', () => {
    expect(body).toContain('selectDocumentModalDestination(post, canUseFreeformEditButton)');
    expect(body).toContain('requestOpenDocument(post, destination)');
    expect(body).toContain('setIsNoteEditorOpen(true);');
  });

  it('preserves title/content/metadata by passing the full post to setPadletToEdit', () => {
    expect(body).toContain('setPadletToEdit(post);');
  });
});

describe('Rows onOpenPost: Document branch', () => {
  const body = slice(canvasClientSrc, 'onReorderPost={handleColumnReorder}', 'onOpenTarget={openPadletTargetFromContextMenu}');

  it('uses the shared Document destination and no longer opens NoteEditor unconditionally', () => {
    expect(body).toContain('selectDocumentModalDestination(post, canUseFreeformEditButton)');
    expect(body).toContain('requestOpenDocument(post, destination)');
    expect(body).toContain('setIsNoteEditorOpen(true);');
  });
});

describe('creation: case "document"', () => {
  const body = slice(canvasClientSrc, "case 'document':", "case 'table':");

  it('opens the editable Document destination directly', () => {
    expect(body).toContain("setDocumentModalDestination('document-editor');");
    expect(body).not.toContain('setIsCardEditorOpen');
  });

  it('draft shape is unchanged -- new id, empty title/content, card type', () => {
    expect(body).toContain("id: 'new'");
    expect(body).toContain("title: '',");
    expect(body).toContain("content: '',");
    expect(body).toContain("type: 'card',");
  });
});

describe('Freeform: openFreeformPadletModal card branch', () => {
  const body = slice(freeformSrc, 'const openFreeformPadletModal = React.useCallback((padlet: Padlet) => {', '\n  }, [');

  it('exact Document uses the shared destination helper', () => {
    const cardBranch = slice(body, "padletType === 'card') {", '\n    }');
    expect(cardBranch).toContain('selectDocumentModalDestination(padlet, canUseFreeformEditButton)');
    expect(cardBranch).not.toContain('setIsNoteEditorOpen');
  });

  it('clipart opens ClipartDraftModal/CardViewer via selectCardModalRoute, matching executePadletTypeEditor', () => {
    // Previously (PATCH-149B2-ii, "C7") the guard's early return left clipart
    // (destination null) falling through to setIsCardEditorOpen -- the legacy
    // CardEditor (plain title/body/description text fields only, no icon,
    // color, caption, or reaction controls), the same editor Document posts
    // use. That made "Edit Post" open the wrong editor for real clipart
    // cards, unlike CardPreview.onOpenToolbar's pencil button and
    // executePadletTypeEditor above, both of which already route clipart
    // through selectCardModalRoute -> ClipartCardDraftModal/CardViewer.
    // Fixed to match those two.
    const secondCardBranch = body.slice(body.indexOf("padletType === 'card') {", body.indexOf("padletType === 'card') {") + 1));
    expect(secondCardBranch).not.toContain('setIsCardEditorOpen(true);');
    expect(secondCardBranch.slice(0, 800)).toContain('selectCardModalRoute(canUseFreeformEditButton)');
    expect(secondCardBranch.slice(0, 800)).toContain('setIsClipartDraftModalOpen(true);');
    expect(secondCardBranch.slice(0, 800)).toContain('setIsCardViewerOpen(true);');
  });
});

describe('Freeform: CardPreview.onOpenToolbar Document/Clipart branch (PATCH-152 targeted correction)', () => {
  // PATCH-152: onEditContent was removed (it duplicated onOpenToolbar's Edit
  // control in the top strip); this routing logic now lives on the single
  // remaining onOpenToolbar handler.
  const body = slice(freeformSrc, 'onOpenToolbar={canUseFreeformEditButton ? ((e) => {', '\n              }) : undefined}');

  it('exact Document uses the shared destination helper (PATCH-149B2-ii: via requestOpenDocument)', () => {
    expect(body).toContain('selectDocumentModalDestination(padlet, canUseFreeformEditButton)');
    expect(body).toContain('requestOpenDocument(padlet, destination)');
  });

  it('clipart routes through the shared ClipartCardDraftModal via selectCardModalRoute, not CardEditor', () => {
    expect(body).toContain('selectCardModalRoute(canUseFreeformEditButton)');
    expect(body).toContain('setIsClipartDraftModalOpen(true);');
    expect(body).toContain('setIsCardViewerOpen(true);');
    expect(body).not.toContain('setIsCardEditorOpen');
  });

  it('no onEditContent wiring remains on this CardPreview call', () => {
    expect(freeformSrc).not.toContain('onEditContent=');
  });
});

describe('CanvasModals: DocumentEditor integration', () => {
  it('renders DocumentEditor exactly once', () => {
    expect((canvasModalsSrc.match(/<DocumentEditor/g) || []).length).toBe(1);
  });

  it('passes title, content and metadata from the selected post', () => {
    const block = slice(canvasModalsSrc, '<DocumentEditor', '/>');
    // getMeaningfulTitle strips legacy placeholder defaults (e.g. "New Post")
    // so they read as unset rather than as a real stored title.
    expect(block).toContain('title={getMeaningfulTitle(padletToEdit?.title, padletToEdit?.type)}');
    expect(block).toContain("initialContent={padletToEdit?.content || ''}");
    expect(block).toContain('metadata={padletToEdit?.metadata ?? null}');
  });

  it('passes an explicit readOnly mode derived from the destination, not inferred from callback presence', () => {
    const block = slice(canvasModalsSrc, '<DocumentEditor', '/>');
    expect(block).toContain("readOnly={documentModalDestination === 'document-viewer'}");
  });

  it('is wrapped in a key that changes on open/close and on the selected Document id', () => {
    // Normalize CRLF so the marker search is line-ending agnostic.
    const normalized = canvasModalsSrc.replace(/\r\n/g, '\n');
    const block = slice(normalized, 'key={\n          documentModalDestination', '}\n      >');
    expect(block).toContain('documentModalDestination');
    expect(block).toContain("`document-${padletToEdit?.id === 'new' ? 'new' : padletToEdit?.id || 'new'}`");
    expect(block).toContain("'document-closed'");
  });

  it('closing clears documentModalDestination and the selected Document (padletToEdit)', () => {
    const block = slice(canvasModalsSrc, '<DocumentEditor', '/>');
    const onCloseBody = slice(block, 'onClose={() => {', '}}');
    expect(onCloseBody).toContain('setDocumentModalDestination(null);');
    expect(onCloseBody).toContain('setPadletToEdit(null);');
  });
});

describe('Drawing remains Document-unreachable', () => {
  it('DrawingLayout is not part of the B1b-ii diff', () => {
    // Scoped proof, not a production change: onEditPadletAsPost stays behind
    // the pre-existing container-type guard, so no Document (a non-container
    // card) can reach NoteEditor through that path (PATCH-149 §22.1 row 8).
    //
    // PATCH 5 migrated CanvasContextMenu onto the shared positioned menu and
    // rewrote that inline ternary as an early-return branch. The behavioral
    // property is unchanged, so this asserts the property directly rather than
    // the old expression's exact text -- and more strictly than before: there
    // must be exactly one invocation, and it must sit inside the guard.
    expect(contextMenuSrc).toContain('isContainerType && onEditPadletAsPost');

    const guard = contextMenuSrc.indexOf('if (isContainerType && onEditPadletAsPost) {');
    expect(guard, 'the container-type guard must still exist').toBeGreaterThan(-1);

    const invocations = contextMenuSrc.match(/onEditPadletAsPost\(/g) ?? [];
    expect(invocations, 'onEditPadletAsPost must be called exactly once').toHaveLength(1);
    expect(
      contextMenuSrc.indexOf('onEditPadletAsPost(padlet)'),
      'the only invocation must sit inside the container-type guard',
    ).toBeGreaterThan(guard);

    // A non-container card still falls through to the ordinary editor.
    expect(contextMenuSrc).toContain('onEdit(padlet);');
  });
});
