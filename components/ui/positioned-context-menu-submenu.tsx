"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { ChevronRightIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  MenuRowIcon,
  menuRowClassName,
  menuRowDisabledClassName,
  menuRowHighlightClassName,
  menuRowIconClassName,
  menuRowIndentClassName,
  menuSurfaceClassName,
} from "./context-menu-styles"
import {
  POSITIONED_MENU_VIEWPORT_MARGIN,
  focusableRows,
  moveFocus,
  usePositionedContextMenu,
} from "./positioned-context-menu"

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
  PositionedContextMenuSub,
  PositionedContextMenuSubTrigger,
  PositionedContextMenuSubContent,
}
export type { PositionedContextMenuSubTriggerProps }
