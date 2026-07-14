"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { normalizeCnic } from "@/lib/client-documents/validate"

type CnicInputProps = {
  value?: string
  onChange: (formatted: string) => void
  disabled?: boolean
  className?: string
  id?: string
}

function digitsOnly(s: string) {
  return s.replace(/\D/g, "")
}

/**
 * Pakistani CNIC as three boxes: 5 - 7 - 1
 * Paste of 13 digits or dashed CNIC is supported.
 */
export function CnicInput({
  value = "",
  onChange,
  disabled,
  className,
  id,
}: CnicInputProps) {
  const normalized = normalizeCnic(value)
  const digits = normalized?.digits || digitsOnly(value).slice(0, 13)

  const part1 = digits.slice(0, 5)
  const part2 = digits.slice(5, 12)
  const part3 = digits.slice(12, 13)

  const ref1 = React.useRef<HTMLInputElement>(null)
  const ref2 = React.useRef<HTMLInputElement>(null)
  const ref3 = React.useRef<HTMLInputElement>(null)

  const emitFromParts = (a: string, b: string, c: string) => {
    const d = `${digitsOnly(a)}${digitsOnly(b)}${digitsOnly(c)}`.slice(0, 13)
    if (d.length === 13) {
      const n = normalizeCnic(d)
      onChange(n ? n.formatted : d)
    } else if (d.length === 0) {
      onChange("")
    } else {
      // partial — still emit dashed as far as we can for controlled forms
      const p1 = d.slice(0, 5)
      const p2 = d.slice(5, 12)
      const p3 = d.slice(12, 13)
      const pieces = [p1]
      if (p2) pieces.push(p2)
      if (p3) pieces.push(p3)
      onChange(pieces.join("-"))
    }
  }

  const applyPaste = (raw: string) => {
    const n = normalizeCnic(raw)
    const d = n?.digits || digitsOnly(raw).slice(0, 13)
    emitFromParts(d.slice(0, 5), d.slice(5, 12), d.slice(12, 13))
    if (d.length >= 13) {
      ref3.current?.focus()
    } else if (d.length >= 5) {
      ref2.current?.focus()
    } else {
      ref1.current?.focus()
    }
  }

  const onPaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text")
    if (!text) return
    event.preventDefault()
    applyPaste(text)
  }

  return (
    <div className={cn("flex items-center gap-2", className)} id={id}>
      <Input
        ref={ref1}
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        placeholder="XXXXX"
        maxLength={5}
        value={part1}
        className="w-[5.5rem] text-center font-mono tracking-wider"
        onPaste={onPaste}
        onChange={(e) => {
          const next = digitsOnly(e.target.value).slice(0, 5)
          emitFromParts(next, part2, part3)
          if (next.length === 5) ref2.current?.focus()
        }}
      />
      <span className="text-muted-foreground select-none">-</span>
      <Input
        ref={ref2}
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        placeholder="XXXXXXX"
        maxLength={7}
        value={part2}
        className="w-[7.5rem] text-center font-mono tracking-wider"
        onPaste={onPaste}
        onChange={(e) => {
          const next = digitsOnly(e.target.value).slice(0, 7)
          emitFromParts(part1, next, part3)
          if (next.length === 7) ref3.current?.focus()
        }}
        onKeyDown={(e) => {
          if (e.key === "Backspace" && !part2) ref1.current?.focus()
        }}
      />
      <span className="text-muted-foreground select-none">-</span>
      <Input
        ref={ref3}
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        placeholder="X"
        maxLength={1}
        value={part3}
        className="w-12 text-center font-mono tracking-wider"
        onPaste={onPaste}
        onChange={(e) => {
          const next = digitsOnly(e.target.value).slice(0, 1)
          emitFromParts(part1, part2, next)
        }}
        onKeyDown={(e) => {
          if (e.key === "Backspace" && !part3) ref2.current?.focus()
        }}
      />
    </div>
  )
}
