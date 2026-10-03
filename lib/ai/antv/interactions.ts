/**
 * PATCH-245. The AntV interactions a picture keeps when it lives inside
 * "PictureStage": everything except `ZoomWheel` and `DragCanvas`, whose
 * Ctrl+wheel / Space+drag the stage now owns. Keeping the list here (rather than
 * inline in the renderer) keeps it importable without pulling AntV into the
 * bundle -- `mod` is the lazily loaded engine.
 *
 * PATCH-260. `DragElement` and `BrushSelect` are also gone: the element editor
 * owns selecting/moving/resizing, and the two AntV interactions fought it.
 *
 * PATCH-270. `HotkeyHistory` is gone too: it was a second undo history restoring
 * AntV's whole options, so Ctrl+Z acted on whichever history a selection happened
 * to route to. The element editor's one scoped history owns undo/redo now.
 *
 * Type-only import: this module has no runtime AntV dependency.
 */

import type { AntvModule } from './setup';

type InteractionCtor = new () => unknown;

const STAGE_INTERACTION_NAMES = [
  'DblClickEditText',
  'ClickSelect',
  'SelectHighlight',
] as const;

/**
 * Builds the curated interaction list from the loaded module. Any interaction
 * the engine does not expose is skipped, so a partial (test) module still works.
 */
export function stageInteractions(mod: AntvModule): unknown[] {
  const registry = mod as unknown as Record<string, InteractionCtor | undefined>;
  return STAGE_INTERACTION_NAMES.flatMap((name) => {
    const Ctor = registry[name];
    return typeof Ctor === 'function' ? [new Ctor()] : [];
  });
}
