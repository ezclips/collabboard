/**
 * PATCH-262/273. The Add panel's insertion logic, extracted from
 * `OutlineSuggestionsPanel` so the oversized panel only carries wiring.
 *
 * An addition is inserted into the outline's per-template override slot through
 * the shared helpers, so adding a shape to design A never touches design B's
 * edits. Pure: no React, no DOM beyond the passed-in plain numbers.
 */

import { type Addition, type AdditionKind } from '@/lib/ai/antv/additions';
import { appendAddition } from '@/lib/ai/antv/additions';
import type { VisualOutline } from '@/lib/ai/outline';
import type { VisualIconName } from '@/lib/ai/visualIcons';

/** A view centre in viewBox units. */
export interface ViewCentre {
  x: number;
  y: number;
}

/** The default preview centre used before the SVG has a usable viewBox. */
export const DEFAULT_VIEW_CENTRE: ViewCentre = { x: 240, y: 160 };

/**
 * Reads the current view centre from an AntV preview's `viewBox`. Returns the
 * default centre when the SVG or its viewBox is missing/unusable.
 */
export function antvViewCentre(svg: Element | null | undefined): ViewCentre {
  const parts = (svg?.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  if (parts.length === 4 && parts.every((value) => Number.isFinite(value))) {
    return { x: parts[0] + parts[2] / 2, y: parts[1] + parts[3] / 2 };
  }
  return { ...DEFAULT_VIEW_CENTRE };
}

/**
 * A NEW outline with `addition` appended to `template`'s own slot (via
 * `appendAddition`, which reads/writes the per-template helpers). Returns the
 * input unchanged when the template has hit the 50-addition cap.
 */
export function insertOutlineAddition(
  outline: VisualOutline,
  template: string,
  addition: Addition,
): VisualOutline {
  return appendAddition(outline, template, addition);
}

/** The default fills/text colours the Add panel uses, read from a theme. */
export interface AdditionColours {
  fill?: string;
  text?: string;
}

export type CreateForKind = (
  kind: AdditionKind,
  centre: ViewCentre,
  options: { fill?: string; text?: string; icon?: VisualIconName },
) => Addition;

export interface AddPanelInserter {
  addShape: (kind: AdditionKind) => void;
  addText: () => void;
  addIcon: (name: VisualIconName) => void;
}

/**
 * PATCH-273. Builds the panel's three insertion callbacks from the current
 * outline/template/colours and a `createAddition` factory. Kept pure so the
 * panel itself only wires refs and state.
 */
export function createAddPanelInserter(params: {
  outline: VisualOutline | null | undefined;
  template: string | null;
  colours: AdditionColours;
  centre: () => ViewCentre;
  create: CreateForKind;
  onEditOutline: (next: VisualOutline) => void;
}): AddPanelInserter {
  const { outline, template, colours, centre, create, onEditOutline } = params;

  const insert = (addition: Addition) => {
    if (!outline || !template) return;
    onEditOutline(insertOutlineAddition(outline, template, addition));
  };

  return {
    addShape: (kind) => insert(create(kind, centre(), { fill: colours.fill })),
    addText: () => insert(create('text', centre(), { text: colours.text })),
    addIcon: (name) => insert(create('icon', centre(), { icon: name, fill: colours.fill })),
  };
}
