"use client";

import * as React from "react";
import { Check } from "lucide-react";

import {
    PositionedContextMenu,
    PositionedContextMenuItem,
    PositionedContextMenuSeparator,
} from "@/components/ui/context-menu";

import type { ExcalidrawContextMenuRendererProps } from "@excalidraw/excalidraw/types";

/**
 * Renders Excalidraw's own right-click menu using the shared CollabBoard menu
 * surface, so the Drawing canvas looks like every other CollabBoard menu.
 *
 * PRESENTATION ONLY. Excalidraw remains the sole owner of menu *function*: it
 * decides which entries exist, their order, their visibility, their checked and
 * destructive state, and it executes them. This component receives entries that
 * Excalidraw has already resolved (see `resolveContextMenuItems` in the fork)
 * and maps them onto shared primitives without interpreting any of them.
 *
 * Consequently the mapping below is deliberately generic: it branches only on
 * `item.type`, `item.checked` and `item.dangerous`. It must never branch on
 * `item.label` — doing so would make CollabBoard a second, divergent
 * implementation of Excalidraw's actions. A source guard test enforces this.
 *
 * Shortcut hints are absent by construction: CollabBoard menus do not display
 * them, and the descriptor contract exposes no shortcut field. Excalidraw's
 * actual keyboard handlers are untouched and keep working.
 */
export default function ExcalidrawCollabBoardContextMenu({
    x,
    y,
    items,
    onClose,
}: ExcalidrawContextMenuRendererProps) {
    return (
        <PositionedContextMenu
            open
            // Already viewport coordinates — Excalidraw converted from its
            // container space before calling us. Clamping belongs to the shared
            // menu, so no adjustment happens here.
            x={x}
            y={y}
            onOpenChange={(nextOpen) => {
                if (!nextOpen) onClose();
            }}
            className="z-[9999] min-w-[200px]"
        >
            {items.map((item) =>
                item.type === "separator" ? (
                    <PositionedContextMenuSeparator key={item.key} />
                ) : (
                    <PositionedContextMenuItem
                        key={item.key}
                        variant={item.dangerous ? "destructive" : "default"}
                        // Excalidraw's opaque execution lifecycle. It already
                        // closes the menu before running the action, so the row's
                        // normal close-on-activate simply converges on the same
                        // Excalidraw-owned state.
                        onSelect={() => item.onSelect()}
                    >
                        <span className="min-w-0 truncate">{item.label}</span>
                        {item.checked && (
                            <span
                                data-slot="excalidraw-menu-checked"
                                className="ml-auto pl-4 flex items-center text-gray-600"
                            >
                                <Check className="w-3.5 h-3.5" />
                            </span>
                        )}
                    </PositionedContextMenuItem>
                )
            )}
        </PositionedContextMenu>
    );
}
