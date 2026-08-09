"use client"

import * as React from "react"
import * as ContextMenuPrimitive from "@radix-ui/react-context-menu"
import { CheckIcon, ChevronRightIcon, CircleIcon } from "lucide-react"

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

const ContextMenu = ContextMenuPrimitive.Root

const ContextMenuTrigger = ContextMenuPrimitive.Trigger

const ContextMenuGroup = ContextMenuPrimitive.Group

const ContextMenuPortal = ContextMenuPrimitive.Portal

const ContextMenuSub = ContextMenuPrimitive.Sub

const ContextMenuRadioGroup = ContextMenuPrimitive.RadioGroup

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
}
export type { ContextMenuSwatchProps }
