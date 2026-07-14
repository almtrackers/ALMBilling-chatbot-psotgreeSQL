"use client"

import * as React from "react"

const SCROLL_THRESHOLD_PX = 5
const SCROLL_CLICK_LOCK_MS = 350

type DragState = {
  startY: number
  startScrollTop: number
  scrolling: boolean
}

let lastTouchScrollAt = 0

export function markTouchScrolled() {
  lastTouchScrollAt = Date.now()
}

export function wasRecentTouchScroll(withinMs = SCROLL_CLICK_LOCK_MS): boolean {
  return Date.now() - lastTouchScrollAt < withinMs
}

const attachedNodes = new WeakSet<HTMLElement>()

/**
 * Single-finger drag-to-scroll for dropdown lists only (Combobox / Select).
 * Do not attach this to page tables or full popovers — that freezes page scroll.
 */
export function attachTouchScroll(node: HTMLElement | null | undefined): () => void {
  if (!node || attachedNodes.has(node) || typeof window === "undefined") {
    return () => undefined
  }

  attachedNodes.add(node)
  node.classList.add("touch-scroll-list", "overscroll-contain")
  node.style.setProperty("-webkit-overflow-scrolling", "touch")
  node.style.touchAction = "pan-y"
  if (getComputedStyle(node).position === "static") {
    node.style.position = "relative"
  }

  const state: { current: DragState | null } = { current: null }

  const clearScrollingFlag = () => {
    node.dataset.touchScrolling = "false"
    state.current = null
  }

  const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 1) {
      clearScrollingFlag()
      return
    }
    state.current = {
      startY: event.touches[0].clientY,
      startScrollTop: node.scrollTop,
      scrolling: false,
    }
    node.dataset.touchScrolling = "false"
  }

  const onTouchMove = (event: TouchEvent) => {
    if (!state.current || event.touches.length !== 1) return
    if (node.scrollHeight <= node.clientHeight + 1) return

    const clientY = event.touches[0].clientY
    const dy = state.current.startY - clientY

    if (!state.current.scrolling) {
      if (Math.abs(dy) < SCROLL_THRESHOLD_PX) return
      state.current.scrolling = true
      node.dataset.touchScrolling = "true"
      markTouchScrolled()
    }

    node.scrollTop = state.current.startScrollTop + dy
    markTouchScrolled()

    // Only stop the gesture from scrolling the page behind the open dropdown
    if (event.cancelable) event.preventDefault()
    event.stopPropagation()
  }

  const onTouchEnd = () => {
    const wasScrolling = !!state.current?.scrolling
    if (wasScrolling) {
      markTouchScrolled()
      window.setTimeout(clearScrollingFlag, SCROLL_CLICK_LOCK_MS)
    } else {
      clearScrollingFlag()
    }
  }

  node.addEventListener("touchstart", onTouchStart, { capture: true, passive: true })
  node.addEventListener("touchmove", onTouchMove, { capture: true, passive: false })
  node.addEventListener("touchend", onTouchEnd, { capture: true, passive: true })
  node.addEventListener("touchcancel", onTouchEnd, { capture: true, passive: true })

  return () => {
    node.removeEventListener("touchstart", onTouchStart, true)
    node.removeEventListener("touchmove", onTouchMove, true)
    node.removeEventListener("touchend", onTouchEnd, true)
    node.removeEventListener("touchcancel", onTouchEnd, true)
    delete node.dataset.touchScrolling
    attachedNodes.delete(node)
  }
}

/** Only real dropdown option lists — not tables, dialogs, or popover shells. */
export const TOUCH_SCROLL_SELECTORS = [
  "[data-dropdown-scroll]",
  "[data-radix-select-viewport]",
  "[cmdk-list]",
].join(",")

export function startTouchScrollObserver(root: ParentNode = document): () => void {
  const cleanups = new Map<HTMLElement, () => void>()

  const scan = (scope: ParentNode) => {
    scope.querySelectorAll<HTMLElement>(TOUCH_SCROLL_SELECTORS).forEach((el) => {
      if (cleanups.has(el)) return
      cleanups.set(el, attachTouchScroll(el))
    })
  }

  scan(root)

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.removedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return
        const nested = [
          ...(node.matches?.(TOUCH_SCROLL_SELECTORS) ? [node] : []),
          ...Array.from(node.querySelectorAll?.(TOUCH_SCROLL_SELECTORS) ?? []),
        ] as HTMLElement[]
        nested.forEach((el) => {
          cleanups.get(el)?.()
          cleanups.delete(el)
        })
      })
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return
        if (node.matches?.(TOUCH_SCROLL_SELECTORS) && !cleanups.has(node)) {
          cleanups.set(node, attachTouchScroll(node))
        }
        scan(node)
      })
    }
  })

  observer.observe(root instanceof Document ? root.body : root, {
    childList: true,
    subtree: true,
  })

  return () => {
    observer.disconnect()
    cleanups.forEach((cleanup) => cleanup())
    cleanups.clear()
  }
}

export function useTouchScroll<T extends HTMLElement = HTMLElement>() {
  const cleanupRef = React.useRef<(() => void) | null>(null)

  const ref = React.useCallback((node: T | null) => {
    cleanupRef.current?.()
    cleanupRef.current = null
    if (!node) return
    cleanupRef.current = attachTouchScroll(node)
  }, [])

  React.useEffect(() => () => cleanupRef.current?.(), [])

  return ref
}

export function mergeRefs<T>(
  ...refs: Array<React.Ref<T> | undefined>
): React.RefCallback<T> {
  return (value) => {
    for (const ref of refs) {
      if (!ref) continue
      if (typeof ref === "function") {
        ref(value)
      } else {
        ;(ref as React.MutableRefObject<T | null>).current = value
      }
    }
  }
}

export const touchScrollClassName =
  "touch-scroll-list overscroll-contain [-webkit-overflow-scrolling:touch] [touch-action:pan-y]"

export function blockClickAfterTouchScroll(
  event: { preventDefault: () => void; stopPropagation?: () => void }
): boolean {
  if (!wasRecentTouchScroll()) return false
  event.preventDefault()
  event.stopPropagation?.()
  return true
}
