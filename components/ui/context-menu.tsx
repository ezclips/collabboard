"use client"

import * as React from "react"
import * as ContextMenuPrimitive from "@radix-ui/react-context-menu"
import { CheckIcon, ChevronRightIcon, CircleIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  MenuRowIcon,
  menuRowClassName,
  menuRowDestructiveClassName,
  menuRowDisabledClassName,
  menuRowHighlightClassName,
  menuRowIconClassName,
  menuRowIndentClassName,
  menuSurfaceClassName,
} from "./context-menu-styles"
import {
  PositionedContextMenu,
  PositionedContextMenuItem,
  PositionedContextMenuLabel,
  PositionedContextMenuSeparator,
  PositionedContextMenuSwatch,
} from "./positioned-context-menu"
import type {
  PositionedContextMenuItemProps,
  PositionedContextMenuProps,
  PositionedContextMenuSwatchProps,
} from "./positioned-context-menu"
import {
  PositionedContextMenuSub,
  PositionedContextMenuSubContent,
  PositionedContextMenuSubTrigger,
} from "./positioned-context-menu-submenu"
import type { PositionedContextMenuSubTriggerProps } from "./positioned-context-menu-submenu"

/**
 * The CollabBoard context-menu surface.
 *
 * Two families share one design, split by *how the menu opens*:
 *
 *   - the Radix-backed `ContextMenu*` components below, for menus that own
 *     their own right-click trigger;
 *   - the `Positioned*` family in ./positioned-context-menu and its submenu
 *     level in ./positioned-context-menu-submenu, for menus whose caller owns
 *     the coordinates and the open state.
 *
 * Both draw every class from ./context-menu-styles, so there is exactly one
 * source of visual truth. This module re-exports the positioned family, which
 * keeps `@/components/ui/context-menu` the single import path for consumers.
 */

const ContextMenu = ContextMenuPrimitive.Root

const ContextMenuTrigger = ContextMenuPrimitive.Trigger

const ContextMenuGroup = ContextMenuPrimitive.Group

const ContextMenuPortal = ContextMenuPrimitive.Portal

const ContextMenuSub = ContextMenuPrimitive.Sub

const ContextMenuRadioGroup = ContextMenuPrimitive.RadioGroup


const ContextMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubTrigger> & {
    inset?: boolean
    icon?: React.ReactNode
  }
>(({ className, inset, icon, children, ...props }, ref) => (
  <ContextMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      menuRowClassName,
      menuRowHighlightClassName,
      menuRowDisabledClassName,
      menuRowIconClassName,
      inset && menuRowIndentClassName,
      className
    )}
    {...props}
  >
    <MenuRowIcon icon={icon} />
    {children}
    <ChevronRightIcon className="ml-auto size-4 shrink-0 text-gray-400" />
  </ContextMenuPrimitive.SubTrigger>
))
ContextMenuSubTrigger.displayName = ContextMenuPrimitive.SubTrigger.displayName

const ContextMenuSubContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.SubContent
    ref={ref}
    data-slot="context-menu-sub-content"
    className={cn(menuSurfaceClassName, className)}
    {...props}
  />
))
ContextMenuSubContent.displayName = ContextMenuPrimitive.SubContent.displayName

const ContextMenuContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Portal>
    <ContextMenuPrimitive.Content
      ref={ref}
      data-slot="context-menu-content"
      className={cn(menuSurfaceClassName, className)}
      {...props}
    />
  </ContextMenuPrimitive.Portal>
))
ContextMenuContent.displayName = ContextMenuPrimitive.Content.displayName

const ContextMenuItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> & {
    inset?: boolean
    variant?: "default" | "destructive"
    icon?: React.ReactNode
  }
>(({ className, inset, variant = "default", icon, children, ...props }, ref) => (
  <ContextMenuPrimitive.Item
    ref={ref}
    data-slot="context-menu-item"
    data-variant={variant}
    className={cn(
      menuRowClassName,
      menuRowHighlightClassName,
      menuRowDisabledClassName,
      menuRowIconClassName,
      inset && menuRowIndentClassName,
      variant === "destructive" && menuRowDestructiveClassName,
      className
    )}
    {...props}
  >
    <MenuRowIcon icon={icon} />
    {children}
  </ContextMenuPrimitive.Item>
))
ContextMenuItem.displayName = ContextMenuPrimitive.Item.displayName

const ContextMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <ContextMenuPrimitive.CheckboxItem
    ref={ref}
    data-slot="context-menu-checkbox-item"
    className={cn(
      menuRowClassName,
      menuRowHighlightClassName,
      menuRowDisabledClassName,
      menuRowIconClassName,
      menuRowIndentClassName,
      className
    )}
    checked={checked}
    {...props}
  >
    <span className="absolute left-2 flex size-3.5 items-center justify-center">
      <ContextMenuPrimitive.ItemIndicator>
        <CheckIcon className="size-4" />
      </ContextMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </ContextMenuPrimitive.CheckboxItem>
))
ContextMenuCheckboxItem.displayName =
  ContextMenuPrimitive.CheckboxItem.displayName

const ContextMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <ContextMenuPrimitive.RadioItem
    ref={ref}
    data-slot="context-menu-radio-item"
    className={cn(
      menuRowClassName,
      menuRowHighlightClassName,
      menuRowDisabledClassName,
      menuRowIconClassName,
      menuRowIndentClassName,
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex size-3.5 items-center justify-center">
      <ContextMenuPrimitive.ItemIndicator>
        <CircleIcon className="size-2 fill-current" />
      </ContextMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </ContextMenuPrimitive.RadioItem>
))
ContextMenuRadioItem.displayName = ContextMenuPrimitive.RadioItem.displayName

const ContextMenuLabel = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Label> & {
    inset?: boolean
  }
>(({ className, inset, ...props }, ref) => (
  <ContextMenuPrimitive.Label
    ref={ref}
    data-slot="context-menu-label"
    className={cn(
      "px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500",
      inset && menuRowIndentClassName,
      className
    )}
    {...props}
  />
))
ContextMenuLabel.displayName = ContextMenuPrimitive.Label.displayName

const ContextMenuSeparator = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Separator
    ref={ref}
    data-slot="context-menu-separator"
    className={cn("-mx-1 my-1 h-px bg-gray-200", className)}
    {...props}
  />
))
ContextMenuSeparator.displayName = ContextMenuPrimitive.Separator.displayName

/** Right-aligned keyboard-shortcut slot. Render as the last child of a row. */
const ContextMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      data-slot="context-menu-shortcut"
      className={cn(
        "ml-auto pl-4 text-[11px] tracking-wide text-gray-400 tabular-nums",
        className
      )}
      {...props}
    />
  )
}
ContextMenuShortcut.displayName = "ContextMenuShortcut"

/**
 * Horizontal container for `ContextMenuSwatch` rows (colors, fills, strokes).
 * Layout only — it holds no knowledge of what the swatches mean.
 */
const ContextMenuSwatchRow = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    role="group"
    data-slot="context-menu-swatch-row"
    className={cn(
      "flex flex-wrap items-center gap-1 px-2 py-1.5",
      className
    )}
    {...props}
  />
))
ContextMenuSwatchRow.displayName = "ContextMenuSwatchRow"

type ContextMenuSwatchProps = Omit<
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item>,
  "children"
> & {
  /** Any CSS color value. Applied as the swatch background. */
  color: string
  /** Accessible name for the swatch, e.g. "Red". Required. */
  label: string
  selected?: boolean
}

/**
 * A single color swatch. Built on `ContextMenuPrimitive.Item` so Radix keyboard
 * navigation, `disabled` handling and select-then-close semantics are preserved.
 */
const ContextMenuSwatch = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Item>,
  ContextMenuSwatchProps
>(({ className, color, label, selected = false, style, ...props }, ref) => (
  <ContextMenuPrimitive.Item
    ref={ref}
    aria-label={label}
    title={label}
    data-slot="context-menu-swatch"
    data-selected={selected ? "" : undefined}
    className={cn(
      "size-5 shrink-0 cursor-default rounded-md border border-black/10 outline-none ring-offset-1 ring-offset-gray-50 transition-shadow",
      "focus:ring-2 focus:ring-gray-900/40 data-[highlighted]:ring-2 data-[highlighted]:ring-gray-900/40",
      "data-[selected]:ring-2 data-[selected]:ring-gray-900",
      menuRowDisabledClassName,
      className
    )}
    style={{ backgroundColor: color, ...style }}
    {...props}
  />
))
ContextMenuSwatch.displayName = "ContextMenuSwatch"

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuGroup,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup,
  ContextMenuSwatchRow,
  ContextMenuSwatch,
  // Positioned (externally-coordinated) family. `ContextMenuShortcut` and
  // `ContextMenuSwatchRow` are plain presentational elements with no Radix
  // dependency, so both families reuse those two components directly.
  PositionedContextMenu,
  PositionedContextMenuItem,
  PositionedContextMenuSeparator,
  PositionedContextMenuLabel,
  PositionedContextMenuSwatch,
  PositionedContextMenuSub,
  PositionedContextMenuSubTrigger,
  PositionedContextMenuSubContent,
}
export type {
  ContextMenuSwatchProps,
  PositionedContextMenuProps,
  PositionedContextMenuItemProps,
  PositionedContextMenuSwatchProps,
  PositionedContextMenuSubTriggerProps,
}
