"use client"

import * as React from "react"
import { createPortal } from "react-dom"
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

/* ══════════════════════════════════════════════════════════════════════════
 * Positioned context menus
 *
 * A companion *opening mechanism* for the same CollabBoard menu design above —
 * not a second design system. Every surface/row class below is the identical
 * constant consumed by the Radix components, and rows publish the same
 * `data-highlighted` / `data-disabled` / `data-variant` attributes those
 * constants key off, so the two families are styled from one source.
 *
 * Use this when the menu does NOT own its right-click trigger: the owner
 * computes `{x, y}` screen coordinates and controls `open` itself (canvas
 * lines, table cells, board backgrounds). Radix's ContextMenu.Root has no
 * genuine controlled `open` API and its Trigger must be a real DOM node, so
 * those call sites cannot use it without a fake trigger or a synthetic
 * contextmenu event. This primitive uses neither.
 *
 * The consumer keeps ownership of open state, coordinates, the right-clicked
 * target's identity, permissions and action routing. This primitive owns only
 * presentation, focus and dismissal.
 * ══════════════════════════════════════════════════════════════════════════ */

/** Gap kept between the menu and the viewport edge when it would overflow. */
const POSITIONED_MENU_VIEWPORT_MARGIN = 8

/**
 * How long a submenu stays open after the pointer leaves its trigger. Long
 * enough to cross the gap into the submenu without a geometry-heavy "safe
 * polygon", short enough not to feel sticky.
 */
const POSITIONED_SUBMENU_CLOSE_DELAY = 150

/** Horizontal overlap between trigger and submenu, so the pointer never crosses a gap. */
const POSITIONED_SUBMENU_OVERLAP = 4

/** Lifts the submenu by the surface's own padding so its first row lines up with the trigger. */
const POSITIONED_SUBMENU_TOP_INSET = 4

type PositionedContextMenuContextValue = {
  /** Closes the whole menu hierarchy via the consumer's `onOpenChange`. */
  close: () => void
  /**
   * The root's portal target, so submenus land in the same container rather
   * than inventing their own. `null` means "the container default".
   */
  container: HTMLElement | null
  /**
   * Registers a portaled submenu surface with the root. Registered surfaces
   * count as *inside* the menu, so interacting with a submenu never trips the
   * root's outside-pointer dismissal. Returns an unregister function.
   */
  registerSatellite: (node: HTMLElement) => () => void
  /**
   * The root surface's resolved z-index, so submenus can sit exactly one layer
   * above it. Consumers routinely raise the root (canvas overlays use
   * `z-[9999]`); a submenu pinned to the shared default would disappear behind
   * it. `null` when it cannot be resolved, in which case the shared surface
   * class applies and sibling DOM order decides.
   */
  surfaceZIndex: number | null
}

const PositionedContextMenuContext =
  React.createContext<PositionedContextMenuContextValue | null>(null)

function usePositionedContextMenu(component: string) {
  const context = React.useContext(PositionedContextMenuContext)
  if (!context) {
    throw new Error(`${component} must be rendered inside <PositionedContextMenu>`)
  }
  return context
}

/**
 * Focusable, non-disabled rows belonging to *this* surface — the roving-focus
 * ring for one menu level.
 *
 * The level check matters: a submenu's rows must never join its parent's ring.
 * Portaling submenu content already puts it outside the root's subtree, but
 * matching on the nearest surface makes that independent of where the content
 * happens to be rendered, so root navigation can never walk into submenu
 * descendants — open or closed.
 */
function focusableRows(surface: HTMLElement | null): HTMLElement[] {
  if (!surface) return []
  return Array.from(
    surface.querySelectorAll<HTMLElement>('[data-positioned-menu-row="true"]')
  ).filter(
    (row) =>
      !row.hasAttribute("data-disabled") &&
      row.closest("[data-positioned-menu-surface]") === surface
  )
}

function moveFocus(surface: HTMLElement | null, delta: number) {
  const rows = focusableRows(surface)
  if (rows.length === 0) return
  const current = rows.indexOf(document.activeElement as HTMLElement)
  // From the surface itself (current === -1), ArrowDown lands on the first row
  // and ArrowUp on the last, matching native menu behavior.
  const next =
    current === -1
      ? delta > 0
        ? 0
        : rows.length - 1
      : (current + delta + rows.length) % rows.length
  rows[next]?.focus()
}

interface PositionedContextMenuProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onSelect"> {
  /** Controlled visibility. The consumer owns this. */
  open: boolean
  /** Viewport-relative X, as captured from the originating event. */
  x: number
  /** Viewport-relative Y, as captured from the originating event. */
  y: number
  /** Called with `false` on Escape, outside pointer-down, Tab, or item select. */
  onOpenChange: (open: boolean) => void
  /**
   * Where to portal the surface. Defaults to `document.body`, matching the
   * `position: fixed` coordinate space the `x`/`y` contract assumes.
   */
  container?: HTMLElement | null
}

/**
 * Menu surface rendered at consumer-supplied viewport coordinates.
 *
 * Positioning contract: the surface's top-left corner sits exactly at
 * (`x`, `y`). It is only pulled back when it would overflow the viewport, and
 * only on the overflowing axis — matching the clamp the hand-rolled board menu
 * already uses, so no call site's current placement changes.
 */
const PositionedContextMenu = React.forwardRef<
  HTMLDivElement,
  PositionedContextMenuProps
>(
  (
    { open, x, y, onOpenChange, container, className, style, children, ...props },
    forwardedRef
  ) => {
    const surfaceRef = React.useRef<HTMLDivElement | null>(null)
    const restoreFocusRef = React.useRef<HTMLElement | null>(null)
    const satellitesRef = React.useRef<Set<HTMLElement>>(new Set())
    const [position, setPosition] = React.useState({ left: x, top: y })
    const [surfaceZIndex, setSurfaceZIndex] = React.useState<number | null>(null)

    const setRefs = React.useCallback(
      (node: HTMLDivElement | null) => {
        surfaceRef.current = node
        if (typeof forwardedRef === "function") forwardedRef(node)
        else if (forwardedRef) forwardedRef.current = node
      },
      [forwardedRef]
    )

    const close = React.useCallback(() => onOpenChange(false), [onOpenChange])

    // Clamp before paint so the menu never visibly jumps.
    React.useLayoutEffect(() => {
      if (!open) return
      const surface = surfaceRef.current
      const width = surface?.offsetWidth ?? 0
      const height = surface?.offsetHeight ?? 0
      setPosition({
        left: Math.min(
          x,
          window.innerWidth - width - POSITIONED_MENU_VIEWPORT_MARGIN
        ),
        top: Math.min(
          y,
          window.innerHeight - height - POSITIONED_MENU_VIEWPORT_MARGIN
        ),
      })
    }, [open, x, y])

    // Resolve the surface's own stacking level so submenus can sit one above it.
    React.useLayoutEffect(() => {
      if (!open) return
      const surface = surfaceRef.current
      if (!surface) return
      const resolved = Number.parseInt(window.getComputedStyle(surface).zIndex, 10)
      setSurfaceZIndex(Number.isNaN(resolved) ? null : resolved)
    }, [open])

    // Move focus into the surface on open; hand it back to the previously
    // focused element on close.
    React.useEffect(() => {
      if (!open) return
      restoreFocusRef.current = document.activeElement as HTMLElement | null
      surfaceRef.current?.focus({ preventScroll: true })
      return () => {
        restoreFocusRef.current?.focus?.({ preventScroll: true })
        restoreFocusRef.current = null
      }
    }, [open])

    // Dismiss on outside pointer-down. Deferred by a macrotask so the very
    // interaction that opened the menu cannot immediately close it.
    React.useEffect(() => {
      if (!open) return
      const handlePointerDown = (event: Event) => {
        const target = event.target as Node
        if (surfaceRef.current?.contains(target)) return
        // Submenus are portaled, so they are not DOM descendants of the root
        // surface. Without this they would read as outside clicks and picking a
        // submenu item would tear down the whole menu.
        for (const satellite of satellitesRef.current) {
          if (satellite.contains(target)) return
        }
        close()
      }
      const timer = window.setTimeout(() => {
        document.addEventListener("pointerdown", handlePointerDown)
        document.addEventListener("mousedown", handlePointerDown)
      }, 0)
      return () => {
        window.clearTimeout(timer)
        document.removeEventListener("pointerdown", handlePointerDown)
        document.removeEventListener("mousedown", handlePointerDown)
      }
    }, [open, close])

    const registerSatellite = React.useCallback((node: HTMLElement) => {
      satellitesRef.current.add(node)
      return () => {
        satellitesRef.current.delete(node)
      }
    }, [])

    const contextValue = React.useMemo(
      () => ({
        close,
        container: container ?? null,
        registerSatellite,
        surfaceZIndex,
      }),
      [close, container, registerSatellite, surfaceZIndex]
    )

    if (!open || typeof document === "undefined") return null

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      props.onKeyDown?.(event)
      if (event.defaultPrevented) return
      switch (event.key) {
        case "Escape":
          event.preventDefault()
          close()
          break
        case "Tab":
          // Native menus dismiss rather than letting focus escape mid-menu.
          event.preventDefault()
          close()
          break
        case "ArrowDown":
          event.preventDefault()
          moveFocus(surfaceRef.current, 1)
          break
        case "ArrowUp":
          event.preventDefault()
          moveFocus(surfaceRef.current, -1)
          break
        case "Home":
          event.preventDefault()
          focusableRows(surfaceRef.current)[0]?.focus()
          break
        case "End": {
          event.preventDefault()
          const rows = focusableRows(surfaceRef.current)
          rows[rows.length - 1]?.focus()
          break
        }
      }
    }

    return createPortal(
      <PositionedContextMenuContext.Provider value={contextValue}>
        <div
          {...props}
          ref={setRefs}
          role="menu"
          tabIndex={-1}
          data-slot="positioned-context-menu-content"
          data-positioned-menu-surface=""
          data-state="open"
          className={cn("fixed", menuSurfaceClassName, className)}
          style={{ left: position.left, top: position.top, ...style }}
          onKeyDown={handleKeyDown}
          onContextMenu={(event) => {
            // A right-click on the menu itself should not open the browser's.
            event.preventDefault()
            props.onContextMenu?.(event)
          }}
        >
          {children}
        </div>
      </PositionedContextMenuContext.Provider>,
      container ?? document.body
    )
  }
)
PositionedContextMenu.displayName = "PositionedContextMenu"

interface PositionedContextMenuItemProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onSelect"> {
  inset?: boolean
  variant?: "default" | "destructive"
  icon?: React.ReactNode
  disabled?: boolean
  /**
   * Fired on activation by click, Enter or Space. Call `preventDefault()` to
   * keep the menu open — the same escape hatch Radix's `onSelect` provides.
   */
  onSelect?: (event: { preventDefault: () => void }) => void
}

/**
 * A row inside `PositionedContextMenu`. Visually identical to
 * `ContextMenuItem`: same row/highlight/disabled/icon/destructive constants,
 * same `data-slot`/`data-variant` hooks.
 */
const PositionedContextMenuItem = React.forwardRef<
  HTMLDivElement,
  PositionedContextMenuItemProps
>(
  (
    {
      className,
      inset,
      variant = "default",
      icon,
      disabled = false,
      onSelect,
      onClick,
      onKeyDown,
      children,
      ...props
    },
    ref
  ) => {
    const { close } = usePositionedContextMenu("PositionedContextMenuItem")

    const activate = () => {
      if (disabled) return
      let prevented = false
      onSelect?.({ preventDefault: () => (prevented = true) })
      if (!prevented) close()
    }

    return (
      <div
        {...props}
        ref={ref}
        role="menuitem"
        tabIndex={disabled ? undefined : -1}
        aria-disabled={disabled || undefined}
        data-positioned-menu-row="true"
        data-slot="context-menu-item"
        data-variant={variant}
        data-disabled={disabled ? "" : undefined}
        className={cn(
          menuRowClassName,
          menuRowHighlightClassName,
          menuRowDisabledClassName,
          menuRowIconClassName,
          inset && menuRowIndentClassName,
          variant === "destructive" && menuRowDestructiveClassName,
          className
        )}
        onClick={(event) => {
          if (disabled) return
          onClick?.(event)
          activate()
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event)
          if (event.defaultPrevented) return
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            activate()
          }
        }}
      >
        <MenuRowIcon icon={icon} />
        {children}
      </div>
    )
  }
)
PositionedContextMenuItem.displayName = "PositionedContextMenuItem"

/** Separator for positioned menus. Same rule styling as `ContextMenuSeparator`. */
const PositionedContextMenuSeparator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    role="separator"
    aria-orientation="horizontal"
    data-slot="context-menu-separator"
    className={cn("-mx-1 my-1 h-px bg-gray-200", className)}
    {...props}
  />
))
PositionedContextMenuSeparator.displayName = "PositionedContextMenuSeparator"

/** Section label for positioned menus. Mirrors `ContextMenuLabel`. */
const PositionedContextMenuLabel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { inset?: boolean }
>(({ className, inset, ...props }, ref) => (
  <div
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
PositionedContextMenuLabel.displayName = "PositionedContextMenuLabel"

type PositionedContextMenuSwatchProps = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "children" | "onSelect"
> & {
  /** Any CSS color value. Applied as the swatch background. */
  color: string
  /** Accessible name for the swatch, e.g. "Red". Required. */
  label: string
  selected?: boolean
  disabled?: boolean
  onSelect?: (event: { preventDefault: () => void }) => void
}

/**
 * A single color swatch for positioned menus. Shares `ContextMenuSwatch`'s
 * exact appearance and participates in the same roving-focus ring as items.
 */
const PositionedContextMenuSwatch = React.forwardRef<
  HTMLDivElement,
  PositionedContextMenuSwatchProps
>(
  (
    {
      className,
      color,
      label,
      selected = false,
      disabled = false,
      onSelect,
      onClick,
      onKeyDown,
      style,
      ...props
    },
    ref
  ) => {
    const { close } = usePositionedContextMenu("PositionedContextMenuSwatch")

    const activate = () => {
      if (disabled) return
      let prevented = false
      onSelect?.({ preventDefault: () => (prevented = true) })
      if (!prevented) close()
    }

    return (
      <div
        {...props}
        ref={ref}
        role="menuitem"
        tabIndex={disabled ? undefined : -1}
        aria-label={label}
        aria-disabled={disabled || undefined}
        title={label}
        data-positioned-menu-row="true"
        data-slot="context-menu-swatch"
        data-selected={selected ? "" : undefined}
        data-disabled={disabled ? "" : undefined}
        className={cn(
          "size-5 shrink-0 cursor-default rounded-md border border-black/10 outline-none ring-offset-1 ring-offset-gray-50 transition-shadow",
          "focus:ring-2 focus:ring-gray-900/40 data-[highlighted]:ring-2 data-[highlighted]:ring-gray-900/40",
          "data-[selected]:ring-2 data-[selected]:ring-gray-900",
          menuRowDisabledClassName,
          className
        )}
        style={{ backgroundColor: color, ...style }}
        onClick={(event) => {
          if (disabled) return
          onClick?.(event)
          activate()
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event)
          if (event.defaultPrevented) return
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            activate()
          }
        }}
      />
    )
  }
)
PositionedContextMenuSwatch.displayName = "PositionedContextMenuSwatch"

/* ──────────────────────────────────────────────────────────────────────────
 * Positioned submenus
 *
 * Same design, same constants, one level down. `PositionedContextMenuSub` is
 * pure state and renders no DOM of its own; the trigger is an ordinary row in
 * its parent surface, and the content is portaled beside it.
 *
 * Portaling (rather than nesting) buys three things: the submenu escapes the
 * parent surface's `overflow-hidden` without consumers having to opt out of it,
 * its rows cannot leak into the parent's roving-focus ring, and it can be
 * stacked above a parent that raised its own z-index. Because the portal still
 * sits inside the React tree, its events bubble to the root surface, which is
 * how Escape reaches the root and how the root avoids double-handling arrow
 * keys the submenu has already consumed.
 * ────────────────────────────────────────────────────────────────────────── */

type PositionedContextMenuSubContextValue = {
  open: boolean
  contentId: string
  triggerRef: React.MutableRefObject<HTMLDivElement | null>
  /**
   * Bumped every time the submenu is asked to take focus from the keyboard, and
   * reset to 0 on close. A counter rather than a flag because ArrowRight must
   * also move focus into a submenu that hover already opened — there is no open
   * state transition to hang that off.
   */
  focusRequest: number
  /** Guards against the trigger's own focus handler reopening what ArrowLeft just closed. */
  suppressFocusOpenRef: React.MutableRefObject<boolean>
  openSubmenu: (options?: { viaKeyboard?: boolean }) => void
  closeSubmenu: (options?: { focusTrigger?: boolean }) => void
  /** Starts the hover-out grace period. */
  scheduleClose: () => void
  /** Cancels a pending hover-out close, e.g. once the pointer reaches the content. */
  cancelClose: () => void
}

const PositionedContextMenuSubContext =
  React.createContext<PositionedContextMenuSubContextValue | null>(null)

function usePositionedContextMenuSub(component: string) {
  const context = React.useContext(PositionedContextMenuSubContext)
  if (!context) {
    throw new Error(`${component} must be rendered inside <PositionedContextMenuSub>`)
  }
  return context
}

/** Groups a submenu trigger with its content. Renders no DOM. */
function PositionedContextMenuSub({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const [focusRequest, setFocusRequest] = React.useState(0)
  const contentId = React.useId()
  const triggerRef = React.useRef<HTMLDivElement | null>(null)
  const suppressFocusOpenRef = React.useRef(false)
  const closeTimerRef = React.useRef<number | null>(null)

  const cancelClose = React.useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const openSubmenu = React.useCallback(
    (options?: { viaKeyboard?: boolean }) => {
      cancelClose()
      setOpen(true)
      if (options?.viaKeyboard) setFocusRequest((request) => request + 1)
    },
    [cancelClose]
  )

  const closeSubmenu = React.useCallback(
    (options?: { focusTrigger?: boolean }) => {
      cancelClose()
      setOpen(false)
      setFocusRequest(0)
      if (options?.focusTrigger) {
        suppressFocusOpenRef.current = true
        triggerRef.current?.focus({ preventScroll: true })
        suppressFocusOpenRef.current = false
      }
    },
    [cancelClose]
  )

  const scheduleClose = React.useCallback(() => {
    cancelClose()
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null
      setOpen(false)
      setFocusRequest(0)
    }, POSITIONED_SUBMENU_CLOSE_DELAY)
  }, [cancelClose])

  React.useEffect(() => cancelClose, [cancelClose])

  const value = React.useMemo(
    () => ({
      open,
      contentId,
      triggerRef,
      focusRequest,
      suppressFocusOpenRef,
      openSubmenu,
      closeSubmenu,
      scheduleClose,
      cancelClose,
    }),
    [open, contentId, focusRequest, openSubmenu, closeSubmenu, scheduleClose, cancelClose]
  )

  return (
    <PositionedContextMenuSubContext.Provider value={value}>
      {children}
    </PositionedContextMenuSubContext.Provider>
  )
}
PositionedContextMenuSub.displayName = "PositionedContextMenuSub"

interface PositionedContextMenuSubTriggerProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onSelect"> {
  inset?: boolean
  icon?: React.ReactNode
  disabled?: boolean
}

/**
 * The row that opens a submenu. Visually an ordinary `PositionedContextMenuItem`
 * with a trailing chevron, and it joins its parent's roving-focus ring the same
 * way — so it is skipped when disabled, exactly like any other row.
 */
const PositionedContextMenuSubTrigger = React.forwardRef<
  HTMLDivElement,
  PositionedContextMenuSubTriggerProps
>(
  (
    {
      className,
      inset,
      icon,
      disabled = false,
      children,
      onMouseEnter,
      onMouseLeave,
      onFocus,
      onClick,
      onKeyDown,
      ...props
    },
    forwardedRef
  ) => {
    const sub = usePositionedContextMenuSub("PositionedContextMenuSubTrigger")

    const setRefs = React.useCallback(
      (node: HTMLDivElement | null) => {
        sub.triggerRef.current = node
        if (typeof forwardedRef === "function") forwardedRef(node)
        else if (forwardedRef) forwardedRef.current = node
      },
      [forwardedRef, sub.triggerRef]
    )

    return (
      <div
        {...props}
        ref={setRefs}
        role="menuitem"
        tabIndex={disabled ? undefined : -1}
        aria-haspopup="menu"
        aria-expanded={sub.open}
        aria-controls={sub.open ? sub.contentId : undefined}
        aria-disabled={disabled || undefined}
        data-positioned-menu-row="true"
        data-slot="context-menu-sub-trigger"
        data-variant="default"
        data-state={sub.open ? "open" : "closed"}
        data-disabled={disabled ? "" : undefined}
        className={cn(
          menuRowClassName,
          menuRowHighlightClassName,
          menuRowDisabledClassName,
          menuRowIconClassName,
          inset && menuRowIndentClassName,
          className
        )}
        onMouseEnter={(event) => {
          onMouseEnter?.(event)
          if (disabled) return
          sub.openSubmenu()
        }}
        onMouseLeave={(event) => {
          onMouseLeave?.(event)
          if (disabled) return
          sub.scheduleClose()
        }}
        onFocus={(event) => {
          onFocus?.(event)
          if (disabled) return
          // ArrowLeft closes the submenu and returns focus here; without this
          // guard that focus would immediately reopen what was just closed.
          if (sub.suppressFocusOpenRef.current) return
          sub.openSubmenu()
        }}
        onClick={(event) => {
          if (disabled) return
          onClick?.(event)
          sub.openSubmenu()
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event)
          if (event.defaultPrevented || disabled) return
          if (event.key === "ArrowRight" || event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            sub.openSubmenu({ viaKeyboard: true })
          }
        }}
      >
        <MenuRowIcon icon={icon} />
        {children}
        <ChevronRightIcon className="ml-auto size-4 shrink-0 text-gray-400" />
      </div>
    )
  }
)
PositionedContextMenuSubTrigger.displayName = "PositionedContextMenuSubTrigger"

/**
 * Submenu surface, positioned from its own trigger. The consumer supplies no
 * coordinates — only the root menu owns externally supplied x/y.
 */
const PositionedContextMenuSubContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(
  (
    { className, style, children, onKeyDown, onMouseEnter, onMouseLeave, ...props },
    forwardedRef
  ) => {
    const { container, registerSatellite, surfaceZIndex } = usePositionedContextMenu(
      "PositionedContextMenuSubContent"
    )
    const sub = usePositionedContextMenuSub("PositionedContextMenuSubContent")
    const contentRef = React.useRef<HTMLDivElement | null>(null)
    const [position, setPosition] = React.useState({ left: 0, top: 0 })

    const setRefs = React.useCallback(
      (node: HTMLDivElement | null) => {
        contentRef.current = node
        if (typeof forwardedRef === "function") forwardedRef(node)
        else if (forwardedRef) forwardedRef.current = node
      },
      [forwardedRef]
    )

    // Place beside the trigger before paint: right by default, flipped left when
    // the right side cannot hold it, and clamped vertically either way.
    React.useLayoutEffect(() => {
      if (!sub.open) return
      const trigger = sub.triggerRef.current
      const content = contentRef.current
      if (!trigger || !content) return

      const rect = trigger.getBoundingClientRect()
      const width = content.offsetWidth
      const height = content.offsetHeight
      const maxLeft = window.innerWidth - width - POSITIONED_MENU_VIEWPORT_MARGIN

      let left = rect.right - POSITIONED_SUBMENU_OVERLAP
      if (left > maxLeft) {
        const flipped = rect.left - width + POSITIONED_SUBMENU_OVERLAP
        // Only flip if the left side genuinely fits; otherwise clamp, so a
        // viewport narrower than the submenu never pushes it off-screen.
        left = flipped >= POSITIONED_MENU_VIEWPORT_MARGIN ? flipped : Math.max(POSITIONED_MENU_VIEWPORT_MARGIN, maxLeft)
      }

      const top = Math.max(
        POSITIONED_MENU_VIEWPORT_MARGIN,
        Math.min(
          rect.top - POSITIONED_SUBMENU_TOP_INSET,
          window.innerHeight - height - POSITIONED_MENU_VIEWPORT_MARGIN
        )
      )

      setPosition({ left, top })
    }, [sub.open, sub.triggerRef])

    // Tell the root this surface counts as inside the menu.
    React.useEffect(() => {
      if (!sub.open) return
      const node = contentRef.current
      if (!node) return
      return registerSatellite(node)
    }, [sub.open, registerSatellite])

    // Keyboard opening should land on something actionable. Pointer opening
    // leaves focus alone, so `focusRequest` stays 0 and this does nothing.
    React.useEffect(() => {
      if (!sub.open || sub.focusRequest === 0) return
      focusableRows(contentRef.current)[0]?.focus({ preventScroll: true })
    }, [sub.open, sub.focusRequest])

    if (!sub.open || typeof document === "undefined") return null

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(event)
      if (event.defaultPrevented) return
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault()
          moveFocus(contentRef.current, 1)
          break
        case "ArrowUp":
          event.preventDefault()
          moveFocus(contentRef.current, -1)
          break
        case "Home":
          event.preventDefault()
          focusableRows(contentRef.current)[0]?.focus()
          break
        case "End": {
          event.preventDefault()
          const rows = focusableRows(contentRef.current)
          rows[rows.length - 1]?.focus()
          break
        }
        case "ArrowLeft":
          event.preventDefault()
          sub.closeSubmenu({ focusTrigger: true })
          break
        // Escape and Tab are deliberately left unhandled: they bubble through
        // the portal to the root surface, which dismisses the whole hierarchy.
        // Every key handled above calls preventDefault, which is also what stops
        // the root from acting on it a second time.
      }
    }

    return createPortal(
      <div
        {...props}
        ref={setRefs}
        id={sub.contentId}
        role="menu"
        tabIndex={-1}
        data-slot="positioned-context-menu-sub-content"
        data-positioned-menu-surface=""
        data-state="open"
        className={cn("fixed", menuSurfaceClassName, className)}
        style={{
          left: position.left,
          top: position.top,
          ...(surfaceZIndex !== null ? { zIndex: surfaceZIndex + 1 } : null),
          ...style,
        }}
        onKeyDown={handleKeyDown}
        onMouseEnter={(event) => {
          onMouseEnter?.(event)
          sub.cancelClose()
        }}
        onMouseLeave={(event) => {
          onMouseLeave?.(event)
          sub.scheduleClose()
        }}
        onContextMenu={(event) => {
          event.preventDefault()
          props.onContextMenu?.(event)
        }}
      >
        {children}
      </div>,
      container ?? document.body
    )
  }
)
PositionedContextMenuSubContent.displayName = "PositionedContextMenuSubContent"

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
