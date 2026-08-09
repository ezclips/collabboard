"use client"

import * as React from "react"
import { createPortal } from "react-dom"

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

export {
  PositionedContextMenu,
  PositionedContextMenuItem,
  PositionedContextMenuSeparator,
  PositionedContextMenuLabel,
  PositionedContextMenuSwatch,
}
export type {
  PositionedContextMenuProps,
  PositionedContextMenuItemProps,
  PositionedContextMenuSwatchProps,
}

/*
 * Internal surface, for ./positioned-context-menu-submenu only.
 *
 * This is how a submenu level plugs into its parent: the root context (close,
 * portal container, satellite registry, resolved z-index) plus the roving-focus
 * helpers, which are surface-scoped so every level drives its own ring with the
 * same code. Deliberately NOT re-exported by the public barrel in ./context-menu.
 */
export {
  POSITIONED_MENU_VIEWPORT_MARGIN,
  usePositionedContextMenu,
  focusableRows,
  moveFocus,
}
