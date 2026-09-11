import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * "Show on board" -- the wiring, and the boundaries it must not cross.
 *
 * The arithmetic is proved in boardObjectReveal.test.ts. What this suite pins
 * is everything the arithmetic cannot see: that the action reaches only the
 * layout that can honour it, that it never becomes a mutation or a permission
 * decision, that it reuses the one camera this board already has, and that the
 * ordinary backlink click it sits beside is completely unchanged.
 *
 * Line comments only, as the sibling suites do -- a block-comment strip would
 * swallow JSX and turn every "not found" assertion into a false pass.
 */
function sourceOf(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
    .replace(/^\s*\/\/.*$/gm, '');
}

const canvasClient = sourceOf('app/dashboard/canvas/[id]/CanvasClient.tsx');
const details = sourceOf('components/collabboard/KnowledgeDocumentDetails.tsx');
const drawer = sourceOf('components/collabboard/KnowledgeSourceReaderDrawer.tsx');
const libraryPanel = sourceOf('components/collabboard/PdfWorkspaceLibraryPanel.tsx');
const revealDomain = sourceOf('lib/domain/canvas/boardObjectReveal.ts');

// ============================================================================
// The layout gate -- one decision, made once
// ============================================================================

describe('only a layout that can reveal is offered the action', () => {
  it('the gate is Freeform, decided in ONE place', () => {
    expect(canvasClient).toContain('const canRevealOnBoard = isFreeformLayout;');
    // Handed down as presence-or-absence, so an unsupported layout renders no
    // control at all rather than a disabled one that promises something false.
    expect(canvasClient).toContain(
      'onRevealBacklinkTargetOnBoard={canRevealOnBoard ? revealKnowledgeBacklinkTargetOnBoard : undefined}',
    );
    // Exactly one gate: no per-surface layout test to drift out of step.
    expect(canvasClient.match(/canRevealOnBoard/g) ?? []).toHaveLength(2);
  });

  it('no unsupported layout is named anywhere in the reveal path', () => {
    // Wall, columns, grid, table, timeline, stream and map keep today's
    // behaviour untouched; V1 must not so much as mention them here.
    const revealBlock = canvasClient.slice(
      canvasClient.indexOf('const revealKnowledgeBacklinkTargetOnBoard'),
      canvasClient.indexOf('const canRevealOnBoard'),
    );
    for (const forbidden of [
      'isWallLayout', 'isColumnsLayout', 'isGridLayout', 'isTimelineLayout',
      'isMapLayout', 'flyTo', 'scrollIntoView',
    ]) {
      expect(revealBlock, forbidden).not.toContain(forbidden);
    }
  });

  it('the surfaces render the action only when handed the callback', () => {
    expect(details).toContain('onShowOnBoard?: (targetPadletId: string) => void;');
    expect(details).toContain('{onShowOnBoard ? (');
    expect(details).toContain('data-knowledge-backlink-show-on-board={row.targetPadletId}');
    expect(libraryPanel).toContain('readonly onShowNoteOnBoard?: (targetPadletId: string) => void;');
    expect(libraryPanel).toContain('{onShowNoteOnBoard ? (');
    expect(libraryPanel).toContain('data-pdf-workspace-library-note-show-on-board={note.targetPadletId}');
  });

  /**
   * Every JSX invocation of one component in the drawer, as its own prop text.
   *
   * The previous version of this rule asked only whether the drawer contained
   * `onShowNoteOnBoard` SOMEWHERE, which one wired site satisfied while the
   * other went without -- and runtime found exactly that: the full-screen
   * workspace Library listed Notes with no Show on board. A per-invocation
   * census is the only shape that can catch a second render site.
   */
  const invocationsOf = (source: string, component: string): string[] => {
    const out: string[] = [];
    let from = 0;
    for (;;) {
      const start = source.indexOf(`<${component}`, from);
      if (start === -1) return out;
      const end = source.indexOf('/>', start);
      expect(end, `unterminated <${component}`).toBeGreaterThan(start);
      out.push(source.slice(start, end + 2));
      from = end + 2;
    }
  };

  it('the drawer really has TWO Library sites, and BOTH are wired', () => {
    const sites = invocationsOf(drawer, 'PdfWorkspaceLibraryPanel');
    // The census itself must not silently shrink to one.
    expect(sites, 'expected the full-screen workspace site and the docked site')
      .toHaveLength(2);
    for (const [index, site] of sites.entries()) {
      expect(site, `Library site ${index} must offer Show on board`)
        .toContain('onShowNoteOnBoard={onRevealBacklinkTargetOnBoard}');
      // ...and the ordinary open is untouched on each.
      expect(site, `Library site ${index} must keep its open callback`)
        .toMatch(/onOpenNote=\{(openBacklinkTarget|onOpenBacklinkTarget)\}/);
    }
  });

  it('both reader hosts are wired for the page-scoped list too', () => {
    const hosts = invocationsOf(drawer, 'KnowledgeDocumentDetails');
    expect(hosts).toHaveLength(2);
    for (const [index, host] of hosts.entries()) {
      expect(host, `reader host ${index}`)
        .toContain('onRevealBacklinkTargetOnBoard={onRevealBacklinkTargetOnBoard}');
      expect(host, `reader host ${index}`).toContain('onOpenBacklinkTarget={onOpenBacklinkTarget}');
    }
  });

  it('both of the reader\'s own backlink lists get the action', () => {
    const lists = invocationsOf(details, 'UsedInNotes');
    expect(lists).toHaveLength(2);
    expect(lists.map((list) => /scope="(document|page)"/.exec(list)?.[1]).sort())
      .toEqual(['document', 'page']);
    for (const list of lists) {
      expect(list).toContain('onShowOnBoard={onRevealBacklinkTargetOnBoard}');
      expect(list).toContain('onOpen={onOpenBacklinkTarget}');
    }
  });

  it('the drawer declares the callback once and forwards it -- no second handler', () => {
    expect(drawer).toContain('onRevealBacklinkTargetOnBoard?: (targetPadletId: string) => void;');
    // One prop threaded through; the gate and the handler stay in CanvasClient.
    expect(drawer).not.toContain('canRevealOnBoard');
    expect(drawer).not.toContain('resolveRevealAnchorPost');
    expect(drawer).not.toContain('panByWorldDelta');
    expect(drawer).not.toContain('BoardObjectRevealRequest');
  });
});

// ============================================================================
// A reveal is an event, and it moves the camera this board already has
// ============================================================================

describe('every reveal hook runs on every render', () => {
  // The regression this guards: the reveal hooks were first written beside the
  // handler that raises them, which sits AFTER CanvasClient's loading return.
  // On a loading render React saw fewer hooks than on a loaded one -- "change
  // in the order of Hooks", then "rendered more hooks than during the previous
  // render", then a Fast Refresh reload loop.
  //
  // Read with comments intact: the ORDER of real lines is the whole subject.
  const raw = readFileSync(resolve(process.cwd(), 'app/dashboard/canvas/[id]/CanvasClient.tsx'), 'utf8');
  const at = (needle: string) => {
    const index = raw.indexOf(needle);
    expect(index, `not found: ${needle}`).toBeGreaterThan(-1);
    return index;
  };

  it('the component has exactly one conditional return, and the hooks precede it', () => {
    const earlyReturn = at('if (!hasMounted || loading) {');
    expect(at('const boardRevealRequestIdRef = useRef(0);')).toBeLessThan(earlyReturn);
    expect(at('const [boardRevealRequest, setBoardRevealRequest]')).toBeLessThan(earlyReturn);
    expect(at('}, [boardRevealRequest?.requestId]);')).toBeLessThan(earlyReturn);
  });

  /**
   * Any React hook call shape, built-in or custom: `useX(` on a word boundary.
   *
   * Written once and asserted against known strings below, because the first
   * version of this rule shipped with a literal backspace where the word
   * boundary belonged -- it matched nothing, and a matcher that can never fire
   * proves nothing while looking like it does.
   */
  const HOOK_CALL = /\buse[A-Z][A-Za-z0-9_]*\s*\(/g;

  it('the hook matcher actually recognises hook calls -- and only hook calls', () => {
    const matches = (source: string) => new RegExp(HOOK_CALL.source).test(source);
    for (const hook of [
      'const a = useRef(0);',
      'const [x, setX] = useState(null);',
      'useEffect(() => {}, []);',
      'const m = useMemo(() => 1, []);',
      'const c = useCallback(() => {}, []);',
      'const v = useCanvasCamera(containerRef);',
      'const p = useBoardCollaboratorAuthority(canvasId, user?.id);',
      'const spaced = useState ("x");',
    ]) {
      expect(matches(hook), hook).toBe(true);
    }
    // Not hooks: a word that merely starts with "use", and a lowercase call.
    for (const notHook of [
      'const u = user(1);',
      'const x = useful(1);',
      'const y = reuseThing(1);',
      'const z = usePlain;',
    ]) {
      expect(matches(notHook), notHook).toBe(false);
    }
  });

  it('no hook of any kind is called after that return', () => {
    const body = raw.slice(at('if (!hasMounted || loading) {'));
    const stripped = body.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const hooks = stripped.match(new RegExp(HOOK_CALL.source, 'g')) ?? [];
    expect(hooks, `hooks after the early return: ${hooks.join(', ')}`).toHaveLength(0);
  });

  it('...and that assertion would FAIL if a hook were added down there', () => {
    // Non-vacuity, proved against the real post-return source rather than a
    // hand-written sample: inject one hook call and the rule must catch it.
    const body = raw.slice(at('if (!hasMounted || loading) {'));
    const stripped = body.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const withSyntheticHook = `${stripped}\n  const sneaky = useState(0);\n`;
    expect(withSyntheticHook.match(new RegExp(HOOK_CALL.source, 'g')) ?? []).toHaveLength(1);
  });

  it('the handler that raises the request is a plain function, not a hook', () => {
    // It legitimately lives after the return; it must therefore never become
    // a useCallback without also moving.
    expect(raw).toContain('const revealKnowledgeBacklinkTargetOnBoard = (targetPadletId: string) => {');
    expect(raw).not.toContain('const revealKnowledgeBacklinkTargetOnBoard = useCallback');
  });
});

describe('the reveal request and the camera it drives', () => {
  it('every ask carries a fresh id, so the same Note can be revealed twice', () => {
    expect(canvasClient).toContain('const boardRevealRequestIdRef = useRef(0);');
    expect(canvasClient).toContain('boardRevealRequestIdRef.current += 1;');
    expect(canvasClient).toContain(
      'setBoardRevealRequest({ requestId: boardRevealRequestIdRef.current, targetPadletId });',
    );
    // Consumed by request id, never by target id -- the whole point.
    expect(canvasClient).toContain('}, [boardRevealRequest?.requestId]);');
  });

  it('the consumer anchors on the RENDERED post, not the requested one', () => {
    // The container-child correction, pinned at the wiring: geometry is read
    // from the anchor, and a target whose anchor cannot be resolved never
    // reaches the camera at all.
    expect(canvasClient).toContain('const anchor = resolveRevealAnchorPost(target, padlets);');
    // One refusal covers every unresolvable ownership case the resolver
    // reports -- a missing parent, a non-container parent, a cycle, and a
    // truthy-but-unusable parentId that the root filter has already hidden.
    // None of them reaches the camera.
    expect(canvasClient).toContain('if (!anchor) return;');
    const revealEffect = canvasClient.slice(
      canvasClient.indexOf('const anchor = resolveRevealAnchorPost(target, padlets);'),
      canvasClient.indexOf('}, [boardRevealRequest?.requestId]);'),
    );
    // The refusal is BEFORE any geometry is read, so stale child coordinates
    // are never even measured, let alone panned to.
    expect(revealEffect.indexOf('if (!anchor) return;'))
      .toBeLessThan(revealEffect.indexOf('getFallbackMinimapItem('));
    expect(canvasClient).toContain('getFallbackMinimapItem(anchor)');
    // The stale child coordinates are never the source of the pan.
    expect(canvasClient).not.toContain('getFallbackMinimapItem(target)');
    // ...and the REQUEST still names the Note, not its container.
    expect(canvasClient).toContain('setBoardRevealRequest({ requestId: boardRevealRequestIdRef.current, targetPadletId });');
  });

  it('it reuses the minimap camera rather than inventing a second one', () => {
    expect(canvasClient).toContain('panByWorldDelta(delta.dx, delta.dy)');
    expect(canvasClient).toContain('getViewportWorldRect({');
    // Geometry comes from the ANCHOR since the container-child correction.
    expect(canvasClient).toContain('getFallbackMinimapItem(anchor)');
    // No parallel viewport system, and no zoom change smuggled into a pan.
    const revealEffect = canvasClient.slice(
      canvasClient.indexOf('if (!boardRevealRequest || !isFreeformLayout) return;'),
      canvasClient.indexOf('}, [boardRevealRequest?.requestId]);'),
    );
    for (const forbidden of ['setCanvasZoom', 'zoomAtViewportPoint', 'scrollTo', 'scrollLeft', 'scrollTop']) {
      expect(revealEffect, forbidden).not.toContain(forbidden);
    }
  });

  it('a zero delta is never handed to the camera', () => {
    // "Already visible" must not produce a no-op pan call.
    expect(canvasClient).toContain('if (delta && (delta.dx !== 0 || delta.dy !== 0)) panByWorldDelta');
  });
});

// ============================================================================
// Fail-safe, read-only, and the untouched neighbours
// ============================================================================

describe('the reveal is navigation and nothing else', () => {
  it('a missing or non-Note target raises no request at all', () => {
    const handler = canvasClient.slice(
      canvasClient.indexOf('const revealKnowledgeBacklinkTargetOnBoard'),
      canvasClient.indexOf('Freeform\'s answer to a reveal request'),
    );
    expect(handler).toContain('if (!target || !isKnowledgeBacklinkNote(target)) return;');
    // The consumer re-checks too, because the board can change between ask
    // and answer.
    expect(canvasClient).toContain('if (!target || !isKnowledgeBacklinkNote(target)) return;');
  });

  it('it consults no edit authority anywhere', () => {
    const revealRegion = canvasClient.slice(
      canvasClient.indexOf('const revealKnowledgeBacklinkTargetOnBoard'),
      canvasClient.indexOf('const canRevealOnBoard'),
    );
    for (const forbidden of [
      'canEditBoard', 'canEditCurrentBoard', 'canUseFreeformEditButton',
      'canEditWorkspace', 'currentWorkspaceRole', 'canManageWorkspace',
    ]) {
      expect(revealRegion, forbidden).not.toContain(forbidden);
    }
  });

  it('it writes nothing -- no board mutation of any kind', () => {
    const revealRegion = canvasClient.slice(
      canvasClient.indexOf('const revealKnowledgeBacklinkTargetOnBoard'),
      canvasClient.indexOf('const canRevealOnBoard'),
    );
    for (const forbidden of [
      'supabase', 'insertPost', 'updatePost', 'deletePost', 'setPadlets',
      'fetch(', 'rpc(', 'position_x:', 'position_y:',
    ]) {
      expect(revealRegion, forbidden).not.toContain(forbidden);
    }
    // The domain half reaches for nothing the server owns either.
    for (const forbidden of ['supabase', 'fetch(', 'rpc(', 'process.env']) {
      expect(revealDomain, forbidden).not.toContain(forbidden);
    }
  });

  it('the ordinary backlink click is completely unchanged', () => {
    // Still the same four lines it has always been, and still what the row
    // itself does. Show on board is a SECOND action beside it.
    expect(canvasClient).toContain('const openKnowledgeBacklinkTarget = (targetPadletId: string) => {');
    expect(canvasClient).toContain('setSelectedPadletId(target.id);');
    expect(canvasClient).toContain('openPadletInTypeEditor(target);');
    expect(details).toContain('onClick={() => onOpen(row.targetPadletId)}');
    expect(libraryPanel).toContain('onClick={() => onOpenNote(note.targetPadletId)}');
    // The reveal reuses that path rather than forking a second open.
    expect(canvasClient).toContain('openKnowledgeBacklinkTarget(targetPadletId);');
  });

  it('no new PDF workspace close or yield mode was introduced', () => {
    // The existing blocking-editor yield stays the only rule.
    expect(drawer).toContain("const yieldsToEditor = isWorkspace && blockingEditorOpen;");
    const revealRegion = canvasClient.slice(
      canvasClient.indexOf('const revealKnowledgeBacklinkTargetOnBoard'),
      canvasClient.indexOf('const canRevealOnBoard'),
    );
    for (const forbidden of ['setIsKnowledgeReaderOpen', 'closeSidePanelRequestId', 'yield', 'minimize']) {
      expect(revealRegion, forbidden).not.toContain(forbidden);
    }
  });
});
