"use client"

import { useEffect } from "react"
import { startTouchScrollObserver } from "@/hooks/use-touch-scroll"

/**
 * Enables single-finger drag-to-scroll on dropdown option lists only
 * (Select, Combobox, Command lists, Dropdown menus).
 */
export function TouchScrollBootstrap() {
  useEffect(() => startTouchScrollObserver(document), [])
  return null
}
