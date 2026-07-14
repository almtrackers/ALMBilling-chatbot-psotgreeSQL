"use client"

import * as React from "react"
import { FileText, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  MAX_DOCUMENT_BYTES,
  validateDocumentFile,
} from "@/lib/client-documents/validate"

type DocumentUploadFieldProps = {
  label: string
  value: File | null
  onChange: (file: File | null) => void
  required?: boolean
  disabled?: boolean
  error?: string
  className?: string
}

export function DocumentUploadField({
  label,
  value,
  onChange,
  required,
  disabled,
  error,
  className,
}: DocumentUploadFieldProps) {
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null)
  const [localError, setLocalError] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (!value) {
      setPreviewUrl(null)
      return
    }
    if (value.type.startsWith("image/")) {
      const url = URL.createObjectURL(value)
      setPreviewUrl(url)
      return () => URL.revokeObjectURL(url)
    }
    setPreviewUrl(null)
  }, [value])

  const handleFile = (file: File | null) => {
    setLocalError(null)
    if (!file) {
      onChange(null)
      return
    }
    const result = validateDocumentFile({
      name: file.name,
      type: file.type,
      size: file.size,
    })
    if (!result.ok) {
      setLocalError(result.message)
      onChange(null)
      if (inputRef.current) inputRef.current.value = ""
      return
    }
    onChange(file)
  }

  const displayError = error || localError

  return (
    <div className={cn("space-y-2", className)}>
      <Label>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <Input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
        disabled={disabled}
        onChange={(e) => handleFile(e.target.files?.[0] || null)}
      />
      <p className="text-xs text-muted-foreground">
        JPG, JPEG, PNG, or PDF. Max {Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))} MB.
      </p>
      {displayError ? (
        <p className="text-sm text-destructive">{displayError}</p>
      ) : null}
      {value ? (
        <div className="relative rounded-md border bg-muted/30 p-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1 h-7 w-7"
            onClick={() => {
              handleFile(null)
              if (inputRef.current) inputRef.current.value = ""
            }}
            disabled={disabled}
          >
            <X className="h-4 w-4" />
          </Button>
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={`${label} preview`}
              className="max-h-40 w-auto rounded object-contain"
            />
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-5 w-5 shrink-0" />
              <span className="truncate">{value.name}</span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
