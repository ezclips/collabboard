"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Shared visual vocabulary for the CollabBoard context-menu shell.
 *
 * These constants are the single source of truth for the menu surface and row
 * geometry so that root menus, submenus, checkbox/radio rows and swatch rows
 * stay visually identical as call sites are migrated onto this primitive.
 *
 * The app only defines `--color-background` / `--color-foreground` as theme
 * tokens (see app/globals.css), so the palette below uses the concrete Tailwind
 * gray scale already used elsewhere in the app rather than shadcn's semantic
 * tokens (`bg-popover`, `bg-accent`, ...) which resolve to nothing here.
 */
const menuSurfaceClassName = cn(
  // Compact, Excalidraw-like light gray island with a subtle border + soft shadow.
  "z-50 min-w-[10rem] overflow-hidden rounded-lg border border-gray-200 bg-gray-50 p-1 text-gray-900 shadow-lg shadow-black/5",
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
  "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"
)

/** Row geometry shared by items, sub triggers, checkbox items and radio items. */
const menuRowClassName =
  "relative flex w-full min-w-0 cursor-default select-none items-center gap-2 rounded-md px-2 py-1 text-[13px] leading-5 outline-none transition-colors"

/** Hover / keyboard-highlight / open-submenu feedback. */
const menuRowHighlightClassName =
  "focus:bg-gray-200/70 focus:text-gray-900 data-[highlighted]:bg-gray-200/70 data-[highlighted]:text-gray-900 data-[state=open]:bg-gray-200/70 data-[state=open]:text-gray-900"

const menuRowDisabledClassName =
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50"

/** Keeps inline lucide icons aligned and sized consistently across every row. */
const menuRowIconClassName =
  "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"

/** Destructive rows stay legible without becoming visually oversized. */
const menuRowDestructiveClassName =
  "text-red-600 focus:bg-red-50 focus:text-red-700 data-[highlighted]:bg-red-50 data-[highlighted]:text-red-700"

/** Indicator gutter used by checkbox/radio rows and by `inset` alignment. */
const menuRowIndentClassName = "pl-7"

/** Optional leading icon slot, shared by items and sub triggers. */
function MenuRowIcon({ icon }: { icon?: React.ReactNode }) {
  if (!icon) {
    return null
  }

  return (
    <span
      aria-hidden="true"
      data-slot="context-menu-icon"
      className="flex size-4 shrink-0 items-center justify-center text-current"
    >
      {icon}
    </span>
  )
}

export {
  menuSurfaceClassName,
  menuRowClassName,
  menuRowHighlightClassName,
  menuRowDisabledClassName,
  menuRowIconClassName,
  menuRowDestructiveClassName,
  menuRowIndentClassName,
  MenuRowIcon,
}
