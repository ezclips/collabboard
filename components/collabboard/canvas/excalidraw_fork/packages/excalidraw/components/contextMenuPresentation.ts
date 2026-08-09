import type { ActionManager } from "../actions/manager";
import type { Action } from "../actions/types";
import type { TranslationKeys } from "../i18n";
import type { AppState } from "../types";
import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

/**
 * Context-menu presentation resolution.
 *
 * This module is the single source of truth for turning Excalidraw's raw
 * context-menu entries into display data: predicate filtering, separator
 * collapsing, label translation, checked state and the destructive
 * classification. Both the native `ContextMenu` renderer and the optional
 * `customContextMenuRenderer` host consume it, so the two presentations cannot
 * drift apart — they are the same computation, not two that happen to agree.
 *
 * It deliberately has no runtime imports (types are erased), which keeps it
 * free of React, SCSS and the App module graph. `translate` is injected rather
 * than imported for the same reason; Excalidraw always supplies its own `t`,
 * so translation ownership stays inside Excalidraw.
 */

export const CONTEXT_MENU_SEPARATOR = "separator";

export type ContextMenuItem = typeof CONTEXT_MENU_SEPARATOR | Action;

export type ContextMenuItems = (ContextMenuItem | false | null | undefined)[];

/**
 * A context-menu entry after Excalidraw has resolved everything about it.
 *
 * `name` is retained for the native renderer's test ids and shortcut lookup and
 * is deliberately NOT part of the public renderer descriptor in types.ts — a
 * host renderer gets no action identity and no shortcut text.
 */
export type ResolvedContextMenuItem =
  | { type: "separator"; key: string }
  | {
      type: "item";
      key: string;
      name: Action["name"];
      label: string;
      checked: boolean;
      dangerous: boolean;
      onSelect: () => void;
    };

export type ResolveContextMenuItemsOptions = {
  items: ContextMenuItems;
  elements: readonly NonDeletedExcalidrawElement[];
  appState: AppState;
  actionManager: ActionManager;
  /** Excalidraw's `t`. Injected so this module stays dependency-free. */
  translate: (key: TranslationKeys) => string;
  onClose: (callback?: () => void) => void;
};

/**
 * Resolves raw context-menu entries into presentation data.
 *
 * Pure: every decision below is Excalidraw's existing one, moved here verbatim
 * from the native renderer. Callers supply state; they make no decisions.
 */
export const resolveContextMenuItems = ({
  items,
  elements,
  appState,
  actionManager,
  translate,
  onClose,
}: ResolveContextMenuItemsOptions): ResolvedContextMenuItem[] => {
  const filteredItems = items.reduce((acc: ContextMenuItem[], item) => {
    if (
      item &&
      (item === CONTEXT_MENU_SEPARATOR ||
        !item.predicate ||
        item.predicate(
          elements,
          appState,
          actionManager.app.props,
          actionManager.app,
        ))
    ) {
      acc.push(item);
    }
    return acc;
  }, []);

  const resolved: ResolvedContextMenuItem[] = [];

  filteredItems.forEach((item, idx) => {
    if (item === CONTEXT_MENU_SEPARATOR) {
      // Drop a separator that leads the menu or follows another separator.
      if (
        !filteredItems[idx - 1] ||
        filteredItems[idx - 1] === CONTEXT_MENU_SEPARATOR
      ) {
        return;
      }
      resolved.push({ type: "separator", key: `separator-${idx}` });
      return;
    }

    const actionName = item.name;
    let label = "";
    if (item.label) {
      if (typeof item.label === "function") {
        label = translate(
          item.label(
            elements,
            appState,
            actionManager.app,
          ) as unknown as TranslationKeys,
        );
      } else {
        label = translate(item.label as unknown as TranslationKeys);
      }
    }

    resolved.push({
      type: "item",
      key: `${actionName}-${idx}`,
      name: actionName,
      label,
      checked: Boolean(item.checked?.(appState)),
      dangerous: actionName === "deleteSelectedElements",
      onSelect: () => {
        // we need update state before executing the action in case
        // the action uses the appState it's being passed (that still
        // contains a defined contextMenu) to return the next state.
        onClose(() => {
          actionManager.executeAction(item, "contextMenu");
        });
      },
    });
  });

  return resolved;
};
