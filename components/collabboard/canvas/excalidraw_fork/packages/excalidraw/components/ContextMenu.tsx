import clsx from "clsx";
import React from "react";

import { getShortcutFromShortcutName } from "../actions/shortcuts";
import { t } from "../i18n";

import { useExcalidrawAppState, useExcalidrawElements } from "./App";

import {
  CONTEXT_MENU_SEPARATOR,
  resolveContextMenuItems,
} from "./contextMenuPresentation";

import { Popover } from "./Popover";

import "./ContextMenu.scss";

import type { ActionManager } from "../actions/manager";
import type { ShortcutName } from "../actions/shortcuts";

import type { ExcalidrawProps } from "../types";
import type {
  ContextMenuItem,
  ContextMenuItems,
  ResolvedContextMenuItem,
} from "./contextMenuPresentation";

type ContextMenuProps = {
  actionManager: ActionManager;
  items: ContextMenuItems;
  top: number;
  left: number;
  onClose: (callback?: () => void) => void;
};

// Presentation resolution lives in ./contextMenuPresentation so that the native
// renderer below and the custom-renderer host share one implementation. These
// re-exports keep the long-standing import path (`./ContextMenu`) working for
// App.tsx and types.ts.
export { CONTEXT_MENU_SEPARATOR, resolveContextMenuItems };
export type { ContextMenuItem, ContextMenuItems, ResolvedContextMenuItem };

export const ContextMenu = React.memo(
  ({ actionManager, items, top, left, onClose }: ContextMenuProps) => {
    const appState = useExcalidrawAppState();
    const elements = useExcalidrawElements();

    const resolvedItems = resolveContextMenuItems({
      items,
      elements,
      appState,
      actionManager,
      translate: t,
      onClose,
    });

    return (
      <Popover
        onCloseRequest={() => {
          onClose();
        }}
        top={top}
        left={left}
        fitInViewport={true}
        offsetLeft={appState.offsetLeft}
        offsetTop={appState.offsetTop}
        viewportWidth={appState.width}
        viewportHeight={appState.height}
        className="context-menu-popover"
      >
        <ul
          className="context-menu"
          onContextMenu={(event) => event.preventDefault()}
        >
          {resolvedItems.map((item) => {
            if (item.type === "separator") {
              return (
                <hr key={item.key} className="context-menu-item-separator" />
              );
            }

            return (
              <li
                key={item.key}
                data-testid={item.name}
                onClick={item.onSelect}
              >
                <button
                  type="button"
                  className={clsx("context-menu-item", {
                    dangerous: item.dangerous,
                    checkmark: item.checked,
                  })}
                >
                  <div className="context-menu-item__label">{item.label}</div>
                  <kbd className="context-menu-item__shortcut">
                    {item.name
                      ? getShortcutFromShortcutName(item.name as ShortcutName)
                      : ""}
                  </kbd>
                </button>
              </li>
            );
          })}
        </ul>
      </Popover>
    );
  },
);

type CustomContextMenuProps = ContextMenuProps & {
  render: NonNullable<ExcalidrawProps["customContextMenuRenderer"]>;
  container: HTMLDivElement | null;
};

/**
 * Delegates context-menu *presentation* to a host-supplied renderer, using the
 * same hooks and the same resolver as the native menu above — so the item set,
 * order, labels, checked and dangerous state are identical by construction
 * rather than by agreement.
 *
 * Everything else stays inside Excalidraw: hit testing, right-click selection,
 * which actions exist, predicates, read-only filtering, and execution.
 */
export const CustomContextMenu = React.memo(
  ({
    actionManager,
    items,
    top,
    left,
    onClose,
    render,
    container,
  }: CustomContextMenuProps) => {
    const appState = useExcalidrawAppState();
    const elements = useExcalidrawElements();

    const resolvedItems = resolveContextMenuItems({
      items,
      elements,
      appState,
      actionManager,
      translate: t,
      onClose,
    });

    // `top`/`left` are container-relative (App subtracts the container rect
    // when opening). Add it back so the renderer receives plain viewport
    // coordinates and never has to know Excalidraw's coordinate system. The
    // native state contract is untouched.
    const rect = container?.getBoundingClientRect();

    return (
      <>
        {render({
          x: (rect?.left ?? 0) + left,
          y: (rect?.top ?? 0) + top,
          items: resolvedItems.map((item) =>
            item.type === "separator"
              ? { type: "separator", key: item.key }
              : {
                  type: "item",
                  key: item.key,
                  label: item.label,
                  checked: item.checked,
                  dangerous: item.dangerous,
                  onSelect: item.onSelect,
                },
          ),
          onClose: () => onClose(),
        })}
      </>
    );
  },
);
