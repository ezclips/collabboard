'use client';

import React from 'react';

import {
  applyElementOverrides,
  elementScreenBox,
  unionScreenBoxes,
  type ElementHandle,
  type ElementOverrides,
  type ScreenBox,
} from '@/lib/ai/antv/elementOverrides';
import {
  outlineWithTemplateOverrides,
  overridesForTemplate,
  withoutElementOverrides,
} from '@/lib/ai/antv/templateOverrides';
import {
  findAdditionByKey,
  isAdditionKey,
  removeAddition,
  resetAdditionColour,
  updateAddition,
} from '@/lib/ai/antv/additions';
import {
  applyEntry,
  createEditHistory,
  diffContentEntries,
  diffOverrides,
  type ContentEditReporter,
  type EditEntry,
} from '@/lib/ai/antv/editHistory';
import { VISUAL_PALETTE } from '@/lib/ai/visualPalette';
import type { VisualOutline } from '@/lib/ai/outline';
import {
  AntvElementChrome,
  ZERO_BOX,
  hasActiveAntvTextEditor,
  initialOverrides,
  isTextElement,
  isTextEntry,
  selectedKeys,
  type ChromeRect,
  type Selection,
} from './AntvElementChrome';
import AntvAddedTextInput from './AntvAddedTextInput';
import { renderAntvElementPanel } from './useAntvElementPanel';
import { usePictureSidePanel } from './PictureSidePanel';
import { useAntvElementColour } from './useAntvElementColour';
import { useAntvElementDrag } from './useAntvElementDrag';
import { useAntvElementSelection, useAntvObjectScope } from './useAntvElementSelection';
import { useAntvIconSwap } from './useAntvIconSwap';
import { useLayerCounterScale } from './PictureEditOverlay';

/**
 * PATCH-260. The HTML editing layer over an AntV picture: selection in SVG
 * geometry (screen deltas, 0x0 icons), whole-item-first clicking, move/resize
 * and scoped undo (PATCH-270). PATCH-275 moves the colour and icon editing out
 * of floating popovers into the element's own docked side panel; only the box,
 * handles, bar and panel remain.
 */

export interface AntvElementEditorProps {
  containerRef: React.RefObject<HTMLElement | null>;
  template: string;
  outline: VisualOutline;
  onChange: (next: VisualOutline) => void;
  /** PATCH-261. The picture's six palette swatches (`theme.palette` strokes). */
  palette?: readonly string[];
  /**
   * PATCH-263 Addendum 1. The scope of the currently selected item/element, so
   * the mind-map +/− overlay can show that node's controls.
   */
  onSelectionChange?: (scope: string | null) => void;
  /**
   * PATCH-270. The renderer writes its AntV inline text edits here, so they are
   * recorded in the SAME history as the editor's own commits.
   */
  contentEditRef?: React.MutableRefObject<ContentEditReporter | null>;
}

const DEFAULT_PALETTE: readonly string[] = VISUAL_PALETTE.map((entry) => entry.stroke);

type Rect = ChromeRect;

export default function AntvElementEditor({
  containerRef,
  template,
  outline,
  onChange,
  palette = DEFAULT_PALETTE,
  onSelectionChange,
  contentEditRef,
}: AntvElementEditorProps) {
  // PATCH-263 Addendum 2. The chrome counter-scales from the layer's REAL
  // on-screen scale; `1 / PictureZoomContext` drew it 1.85-2.7x too big on the
  // AntV path, where the stage zooms the viewBox instead of CSS-scaling the layer.
  const counterScale = useLayerCounterScale(containerRef);

  const [overrides, setOverrides] = React.useState<ElementOverrides | undefined>(() =>
    initialOverrides(outline, template),
  );
  const [selection, setSelection] = React.useState<Selection | null>(null);
  const [rect, setRect] = React.useState<Rect | null>(null);
  const [editingText, setEditingText] = React.useState<{ key: string; value: string } | null>(null);

  // PATCH-275. The element's own panel lives in the docked column the provider
  // owns. Without a provider nothing is rendered (unit tests, plain usage).
  const pictureSidePanel = usePictureSidePanel();
  const elementPanelOpen = pictureSidePanel?.elementPanelOpen ?? false;
  const setElementPanelOpen = pictureSidePanel?.setElementPanelOpen;

  // Refs keep the native listeners reading fresh values; state is not mirrored
  // during render (a concurrent render could clobber a resize's stale base).
  const overridesRef = React.useRef(overrides);
  const selectionRef = React.useRef(selection);
  const outlineRef = React.useRef(outline);
  outlineRef.current = outline;
  React.useEffect(() => {
    overridesRef.current = overrides;
  }, [overrides]);
  React.useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);
  const pendingNarrowRef = React.useRef<Selection | null>(null);
  const suppressClickRef = React.useRef(false);
  /** PATCH-270. One scoped history for the picture (past/future, max 50). */
  const historyRef = React.useRef(createEditHistory());
  /** PATCH-270. The full overrides at drag start, so a drag records only its keys. */
  const dragBaseRef = React.useRef<ElementOverrides | undefined>(undefined);

  const recordEdit = React.useCallback((entry: EditEntry) => {
    historyRef.current.record(entry);
  }, []);

  const rootElement = React.useCallback((): HTMLElement | null => containerRef.current, [containerRef]);

  // PATCH-276. The panel's object members, key resolver and DOM lookup.
  const { objectKeys, objectKeysRef, keyOf, findElement } = useAntvObjectScope(selection, rootElement, overrides);

  const toPercent = React.useCallback(
    (box: ScreenBox): Rect => {
      const root = rootElement();
      const host = root?.getBoundingClientRect();
      const width = host?.width || 1;
      const height = host?.height || 1;
      return {
        left: ((box.left - (host?.left ?? 0)) / width) * 100,
        top: ((box.top - (host?.top ?? 0)) / height) * 100,
        width: (box.width / width) * 100,
        height: (box.height / height) * 100,
      };
    },
    [rootElement],
  );

  const screenBoxOfKeys = React.useCallback(
    (keys: string[]): ScreenBox => {
      const boxes = keys.map((key) => {
        const el = findElement(key);
        return el ? elementScreenBox(el) : null;
      });
      return unionScreenBoxes(boxes) ?? ZERO_BOX;
    },
    [findElement],
  );

  const measureKeys = React.useCallback(
    (keys: string[]): Rect | null => (keys.length ? toPercent(screenBoxOfKeys(keys)) : null),
    [screenBoxOfKeys, toPercent],
  );

  const cloneOverrides = React.useCallback((): ElementOverrides => {
    const current = overridesRef.current;
    if (!current) return { template, items: {} };
    const next: ElementOverrides = { template: current.template, items: { ...current.items } };
    if (current.additions) next.additions = current.additions.map((addition) => ({ ...addition }));
    return next;
  }, [template]);

  const applyLive = React.useCallback(
    (next: ElementOverrides) => {
      overridesRef.current = next;
      setOverrides(next);
      const root = rootElement();
      if (root) applyElementOverrides(root, next, template);
    },
    [rootElement, template],
  );

  const emit = React.useCallback(
    (nextOverrides: ElementOverrides | undefined, content: VisualOutline) => {
      // PATCH-273. The editor's edits belong to the design it is on (`template`),
      // so they are written into that design's own slot -- never replacing another.
      const next = outlineWithTemplateOverrides(content, template, nextOverrides);
      outlineRef.current = next;
      onChange(next);
    },
    [onChange, template],
  );

  // PATCH-260, defect 1. The editor OWNS `elementOverrides`; the outline prop can
  // arrive a beat late (or, live, carrying a foreign/stale map). A prop must never
  // clobber what the user just committed -- it may only ADD a key the editor does
  // not already have. Local committed state always wins for a shared key.
  //
  // PATCH-262. Additions are shared with the Add side panel, which writes them
  // straight into the outline; they are taken from the prop, and the most
  // recently added one is selected.
  React.useEffect(() => {
    const incoming = initialOverrides(outline, template);
    const incomingItems = incoming?.items ?? {};
    const local = overridesRef.current;
    const localItems = local?.items ?? {};
    const added = Object.keys(incomingItems).filter((key) => !(key in localItems));
    const incomingAdditions = incoming?.additions;
    const localAdditions = local?.additions;
    const additionsChanged =
      JSON.stringify(incomingAdditions ?? []) !== JSON.stringify(localAdditions ?? []);
    if (added.length === 0 && !additionsChanged) return;

    const merged: ElementOverrides = { template, items: { ...localItems } };
    for (const key of added) merged.items[key] = incomingItems[key];
    if (incomingAdditions && incomingAdditions.length) merged.additions = incomingAdditions;
    overridesRef.current = merged;
    setOverrides(merged);
    const root = rootElement();
    if (root) applyElementOverrides(root, merged, template);

    if (incomingAdditions && incomingAdditions.length) {
      const localIds = new Set((localAdditions ?? []).map((addition) => addition.id));
      const fresh = incomingAdditions.filter((addition) => !localIds.has(addition.id));
      if (fresh.length) {
        // The Add panel wrote the addition straight into the outline: make the
        // insertion undoable here, where the editor owns the history.
        const entry = diffOverrides(template, local, merged);
        if (entry) recordEdit(entry);
        const key = `ai-addition@${fresh[fresh.length - 1].id}`;
        const nextSelection: Selection = { kind: 'element', key, scope: null };
        selectionRef.current = nextSelection;
        setSelection(nextSelection);
        setRect(measureKeys([key]));
      }
    }
  }, [outline, template, rootElement, measureKeys, recordEdit]);

  const setPresent = React.useCallback(
    (next: ElementOverrides | undefined) => {
      overridesRef.current = next;
      setOverrides(next);
      emit(next, outlineRef.current);
    },
    [emit],
  );

  const commit = React.useCallback(
    (next: ElementOverrides | undefined) => {
      const entry = diffOverrides(template, overridesRef.current, next);
      if (!entry) return;
      recordEdit(entry);
      setPresent(next);
    },
    [recordEdit, setPresent, template],
  );

  const commitDrag = React.useCallback(() => {
    const next = overridesRef.current;
    // Addendum 1: only the keys that changed since drag start are recorded, so
    // undoing a move never touches an unrelated element or a redone addition.
    const entry = diffOverrides(template, dragBaseRef.current, next);
    if (!entry) return;
    recordEdit(entry);
    setPresent(next);
  }, [recordEdit, setPresent, template]);

  /** PATCH-262. A content-only change (an outline item's icon), undoable. */
  const commitContent = React.useCallback(
    (content: VisualOutline) => {
      const prev = withoutElementOverrides(outlineRef.current);
      const next = withoutElementOverrides(content);
      const entries = diffContentEntries(prev, next);
      if (entries.length === 0) return;
      recordEdit({ kind: 'group', entries });
      emit(overridesRef.current, next);
    },
    [emit, recordEdit],
  );

  /** PATCH-270/273. Applies a restored outline: this design's overrides, DOM and parent. */
  const applyRestored = React.useCallback(
    (next: VisualOutline) => {
      const nextOverrides = overridesForTemplate(next, template);
      overridesRef.current = nextOverrides;
      setOverrides(nextOverrides);
      outlineRef.current = next;
      onChange(next);
      const root = rootElement();
      if (root) applyElementOverrides(root, nextOverrides, template);
    },
    [onChange, rootElement, template],
  );

  const undo = React.useCallback(() => {
    const entry = historyRef.current.undoEntry();
    if (!entry) return;
    applyRestored(applyEntry(outlineRef.current, entry, 'undo'));
  }, [applyRestored]);

  const redo = React.useCallback(() => {
    const entry = historyRef.current.redoEntry();
    if (!entry) return;
    applyRestored(applyEntry(outlineRef.current, entry, 'redo'));
  }, [applyRestored]);

  // PATCH-270. AntV inline text edits arrive from the renderer; record the
  // field-level diff in this same history.
  const recordContentEdit = React.useCallback<ContentEditReporter>(
    (previous, next) => {
      const entries = diffContentEntries(withoutElementOverrides(previous), withoutElementOverrides(next));
      if (entries.length === 0) return;
      recordEdit({ kind: 'group', entries });
    },
    [recordEdit],
  );

  React.useEffect(() => {
    if (!contentEditRef) return;
    contentEditRef.current = recordContentEdit;
    return () => {
      if (contentEditRef.current === recordContentEdit) contentEditRef.current = null;
    };
  }, [contentEditRef, recordContentEdit]);

  const commitHidden = React.useCallback(
    (keys: string[]) => {
      let next = cloneOverrides();
      for (const key of keys) {
        if (isAdditionKey(key)) next = removeAddition(next, key);
        else next.items[key] = { ...(next.items[key] ?? {}), hidden: true };
      }
      commit(next);
    },
    [cloneOverrides, commit],
  );

  const commitReset = React.useCallback(
    (keys: string[]) => {
      let next = cloneOverrides();
      for (const key of keys) {
        if (isAdditionKey(key)) next = resetAdditionColour(next, key);
        else delete next.items[key];
      }
      commit(next);
    },
    [cloneOverrides, commit],
  );

  // ── Colour (PATCH-261/275) ─────────────────────────────────────────────────

  const {
    recent,
    applyColour,
    resetColour,
    resetRow,
    resetSession,
    endSession,
  } = useAntvElementColour({
    template,
    objectKeysRef,
    overridesRef,
    findElement,
    keyOf,
    cloneOverrides,
    commit,
    recordEdit,
    setOverrides,
    getContent: () => outlineRef.current,
    emit,
    palette,
  });

  const colourKeys = selection ? selectedKeys(selection) : [];
  // PATCH-261 fix. AntV's own text toolbar sits directly above a selected text
  // element (z-index 9999), exactly where our bar would be, so a text-only
  // selection drops the bar below the box. If below would leave the stage, fall
  // back to the normal above-left placement.
  const textOnlySelection = colourKeys.length > 0 && colourKeys.every((key) => isTextElement(findElement(key)));
  const barBelow = rect !== null && textOnlySelection && rect.top + rect.height < 80;

  const openPanel = React.useCallback(() => {
    setElementPanelOpen?.(true);
  }, [setElementPanelOpen]);

  const togglePanel = React.useCallback(() => {
    setElementPanelOpen?.(!elementPanelOpen);
  }, [setElementPanelOpen, elementPanelOpen]);

  // ── Change icon (PATCH-262/275) ─────────────────────────────────────────────

  const { iconItemIndex, iconCurrent, applyIcon } = useAntvIconSwap({
    selection,
    findElement,
    template,
    outline,
    getContent: () => outlineRef.current,
    commitContent,
    onPicked: () => {},
  });

  // Added text: double-click opens a small inline input (Enter/blur commit,
  // Escape cancels). The input is an <input>, so the editor's key handler yields.
  const commitAddedText = React.useCallback(
    (key: string, value: string) => {
      const addition = findAdditionByKey(overridesRef.current, key);
      if (addition) commit(updateAddition(cloneOverrides(), key, { label: value.slice(0, 200) }));
      setEditingText(null);
    },
    [cloneOverrides, commit],
  );

  /** PATCH-275. The panel's added-text label / size, undoable via the override map. */
  const commitAdditionLabel = React.useCallback(
    (key: string, value: string) => {
      commit(updateAddition(cloneOverrides(), key, { label: value.slice(0, 200) }));
    },
    [cloneOverrides, commit],
  );

  const commitAdditionFontSize = React.useCallback(
    (key: string, size: number) => {
      commit(updateAddition(cloneOverrides(), key, { fontSize: size }));
    },
    [cloneOverrides, commit],
  );

  /** PATCH-275. Applies a text edit to the outline and records its history entry. */
  const commitOutline = React.useCallback(
    (next: VisualOutline, entry: EditEntry | null) => {
      if (entry) recordEdit(entry);
      emit(overridesRef.current, next);
    },
    [emit, recordEdit],
  );

  // ── Selection ──────────────────────────────────────────────────────────────

  const applyNarrow = React.useCallback(
    (next: Selection) => {
      selectionRef.current = next;
      setSelection(next);
      setRect(measureKeys(selectedKeys(next)));
    },
    [measureKeys],
  );

  // Move/resize pointer machine (PATCH-260), and its text-selection guard.
  const { beginMove, beginResize } = useAntvElementDrag({
    rootElement,
    selectionRef,
    overridesRef,
    pendingNarrowRef,
    suppressClickRef,
    applyLive,
    cloneOverrides,
    commitDrag,
    applyNarrow,
    measureKeys,
    screenBoxOfKeys,
    toPercent,
    findElement,
    setRect,
  });

  // Addendum 1. Snapshot the full overrides at drag start (including additions),
  // so the drag commit records each dragged key's `before` against the state it
  // actually started from.
  const beginMoveTracked = React.useCallback(
    (event: PointerEvent, next: Selection, narrowTo: Selection | null) => {
      dragBaseRef.current = cloneOverrides();
      beginMove(event, next, narrowTo);
    },
    [beginMove, cloneOverrides],
  );

  const beginResizeTracked = React.useCallback(
    (event: React.PointerEvent, handle: ElementHandle) => {
      dragBaseRef.current = cloneOverrides();
      beginResize(event, handle);
    },
    [beginResize, cloneOverrides],
  );

  const selectionLabel = selection ? (selection.kind === 'item' ? `item@${selection.scope}` : selection.key) : '';

  // PATCH-263 Addendum 1. Publish the selected scope so the mind-map +/− overlay
  // can reveal the controls of the selected node.
  React.useEffect(() => {
    onSelectionChange?.(selection ? selection.scope : null);
  }, [selection, onSelectionChange]);

  // PATCH-275. Selecting an element opens its panel; deselecting closes it.
  React.useEffect(() => {
    setElementPanelOpen?.(selection !== null);
  }, [selection, setElementPanelOpen]);

  // PATCH-275. A colour session is "this panel on this selection": its picks
  // merge into the recent list when the selection or panel changes, and the
  // per-row history resets.
  const selectionKey = selection ? selectedKeys(selection).join('|') : '';
  React.useEffect(() => {
    resetSession();
    return () => endSession();
  }, [selectionKey, elementPanelOpen, resetSession, endSession]);

  // Container listeners: select + start a move, narrow on a click, and open the
  // element panel on a double-click of a shape/icon (PATCH-270: extracted hook).
  useAntvElementSelection({
    rootElement,
    selectionRef,
    overridesRef,
    pendingNarrowRef,
    suppressClickRef,
    measureKeys,
    setSelection,
    setRect,
    applyNarrow,
    beginMove: beginMoveTracked,
    openPanel,
    setEditingText,
  });

  // Draw the overrides (including additions) once the container exists.
  React.useEffect(() => {
    const root = rootElement();
    if (root) applyElementOverrides(root, overridesRef.current, template);
  }, [rootElement, template]);

  // Re-measure after a commit / undo.
  React.useEffect(() => {
    setRect(selection ? measureKeys(selectedKeys(selection)) : null);
  }, [measureKeys, overrides, selection]);

  // PATCH-260, defect 2. PictureStage zooms/pans by rewriting the SVG's
  // `viewBox`; the selection box and its handles are positioned in screen
  // geometry, so they must be recomputed when it changes.
  React.useEffect(() => {
    const root = rootElement();
    if (!root || typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(() => {
      const current = selectionRef.current;
      if (current) setRect(measureKeys(selectedKeys(current)));
    });
    observer.observe(root, { attributes: true, subtree: true, attributeFilter: ['viewBox'] });
    return () => observer.disconnect();
  }, [measureKeys, rootElement]);

  // PATCH-274. A structural edit (add/remove/reorder) remaps every positional
  // override key, so this design's history entries would replay stale keys onto
  // whatever now sits at that position. Clear the history when the item id
  // sequence changes; the editor's own commits never change item ids.
  const itemIdSignature = outline.items.map((item) => item.id ?? '').join('|');
  const lastItemIdSignatureRef = React.useRef(itemIdSignature);
  React.useEffect(() => {
    if (lastItemIdSignatureRef.current === itemIdSignature) return;
    lastItemIdSignatureRef.current = itemIdSignature;
    historyRef.current.clear();
  }, [itemIdSignature]);

  // Reset local state when the design changes.
  React.useEffect(() => {
    const next = initialOverrides(outlineRef.current, template);
    overridesRef.current = next;
    selectionRef.current = null;
    setOverrides(next);
    setSelection(null);
    setEditingText(null);
    resetSession();
    historyRef.current.clear();
  }, [template, resetSession]);

  // Keyboard: Escape deselects; Delete hides; Ctrl/⌘+Z / Shift+Z / Y. PATCH-270:
  // attached with OR without a selection, so Ctrl+Z reaches our history whenever
  // focus is not in an input / contenteditable / AntV's inline editor.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTextEntry(document.activeElement) || hasActiveAntvTextEditor(rootElement())) return;
      const current = selectionRef.current;
      const keys = selectedKeys(current);
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (event.key === 'Escape') {
        if (!current) return;
        // PATCH-265/275. Escape inside a panel field is handled by the field
        // (focus is in an input, so we returned above). Otherwise Escape
        // deselects, which closes the panel. Prevent the key in the capture
        // phase so a document listener -- the docked panel's close-on-Escape --
        // yields to it.
        event.preventDefault();
        selectionRef.current = null;
        setSelection(null);
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        if (keys.length === 0) return;
        event.preventDefault();
        commitHidden(keys);
      } else if (mod && !event.shiftKey && key === 'z') {
        event.preventDefault();
        undo();
      } else if (mod && ((event.shiftKey && key === 'z') || key === 'y')) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [commitHidden, redo, rootElement, undo]);

  const handleDelete = () => commitHidden(selectedKeys(selectionRef.current));
  const handleReset = () => commitReset(selectedKeys(selectionRef.current));
  /** PATCH-276. The panel's footer acts on the OBJECT; the bar acts on the selection. */
  const handleObjectDelete = () => commitHidden(objectKeys);
  const handleObjectReset = () => commitReset(objectKeys);

  if (!selection || !rect) {
    return (
      <div
        data-ai-element-overlay="true"
        data-ai-element-selected=""
        className="pointer-events-none absolute inset-0 z-[10000]"
        style={{ pointerEvents: 'none' }}
      />
    );
  }

  // PATCH-263. The handles need the container's on-screen size to convert the
  // outward offset (half handle + 2px) into the percent geometry the overlay
  // uses. `rect` is already relative to this same host.
  const hostRect = rootElement()?.getBoundingClientRect();
  const screenWidth = hostRect?.width ?? 0;
  const screenHeight = hostRect?.height ?? 0;

  const panel = renderAntvElementPanel(elementPanelOpen, pictureSidePanel?.host ?? null, {
    selection,
    outline,
    template,
    palette,
    recent,
    overrides,
    findElement,
    objectKeys,
    elementKeyOf: keyOf,
    iconItemIndex,
    iconCurrent,
    getContent: () => outlineRef.current,
    commitOutline,
    onApplyColour: applyColour,
    onResetColour: resetColour,
    onResetRow: resetRow,
    onApplyIcon: applyIcon,
    onAdditionText: commitAdditionLabel,
    onAdditionFontSize: commitAdditionFontSize,
    onReset: handleObjectReset,
    onDelete: handleObjectDelete,
    onClose: () => setElementPanelOpen?.(false),
  });

  return (
    <AntvElementChrome
      selectionLabel={selectionLabel}
      members={selection.kind === 'item' ? selection.keys.join(',') : undefined}
      rect={rect}
      screenWidth={screenWidth}
      screenHeight={screenHeight}
      counterScale={counterScale}
      colourOpen={elementPanelOpen}
      barBelow={barBelow}
      onResize={beginResizeTracked}
      onUndo={undo}
      onRedo={redo}
      onReset={handleReset}
      onDelete={handleDelete}
      onToggleColour={togglePanel}
    >
      {editingText && (
        <AntvAddedTextInput
          value={editingText.value}
          left={rect.left + rect.width / 2}
          top={rect.top + rect.height / 2}
          counterScale={counterScale}
          onCommit={(value) => commitAddedText(editingText.key, value)}
          onCancel={() => setEditingText(null)}
        />
      )}
      {panel}
    </AntvElementChrome>
  );
}
