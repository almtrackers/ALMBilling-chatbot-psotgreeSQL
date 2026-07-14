"use client"

import { useState } from "react"
import { ExternalLink, Download, Replace, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { DocumentUploadField } from "@/components/ui/document-upload-field"
import { useToast } from "@/hooks/use-toast"

type ClientDocumentActionsProps = {
  clientId: number | null
  kind: "cnic_front" | "cnic_back"
  hasDocument: boolean
  onReplaced?: () => void
}

export function ClientDocumentActions({
  clientId,
  kind,
  hasDocument,
  onReplaced,
}: ClientDocumentActionsProps) {
  const { toast } = useToast()
  const [replaceOpen, setReplaceOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  if (!clientId) {
    return <span className="text-xs text-muted-foreground">No document uploaded</span>
  }

  if (!hasDocument) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">No document uploaded</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7"
          onClick={() => setReplaceOpen(true)}
        >
          <Replace className="mr-1 h-3 w-3" />
          Upload
        </Button>
        <ReplaceDialog
          open={replaceOpen}
          onOpenChange={setReplaceOpen}
          file={file}
          setFile={setFile}
          saving={saving}
          onSave={async () => {
            if (!file) return
            setSaving(true)
            try {
              const fd = new FormData()
              fd.append("file", file)
              const res = await fetch(`/api/clients/${clientId}/documents/${kind}`, {
                method: "PUT",
                body: fd,
                credentials: "include",
              })
              const json = await res.json().catch(() => ({}))
              if (!res.ok) throw new Error(json.message || "Upload failed")
              toast({ title: "Document saved" })
              setReplaceOpen(false)
              setFile(null)
              onReplaced?.()
            } catch (e: unknown) {
              toast({
                variant: "destructive",
                title: "Upload failed",
                description: e instanceof Error ? e.message : "Upload failed",
              })
            } finally {
              setSaving(false)
            }
          }}
        />
      </div>
    )
  }

  const viewUrl = `/api/clients/${clientId}/documents/${kind}`
  const downloadUrl = `${viewUrl}?download=1`

  return (
    <div className="flex flex-wrap gap-1">
      <Button type="button" variant="outline" size="sm" className="h-7" asChild>
        <a href={viewUrl} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="mr-1 h-3 w-3" />
          View
        </a>
      </Button>
      <Button type="button" variant="outline" size="sm" className="h-7" asChild>
        <a href={downloadUrl}>
          <Download className="mr-1 h-3 w-3" />
          Download
        </a>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7"
        onClick={() => setReplaceOpen(true)}
      >
        <Replace className="mr-1 h-3 w-3" />
        Replace
      </Button>
      <ReplaceDialog
        open={replaceOpen}
        onOpenChange={setReplaceOpen}
        file={file}
        setFile={setFile}
        saving={saving}
        onSave={async () => {
          if (!file) return
          setSaving(true)
          try {
            const fd = new FormData()
            fd.append("file", file)
            const res = await fetch(`/api/clients/${clientId}/documents/${kind}`, {
              method: "PUT",
              body: fd,
              credentials: "include",
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(json.message || "Replace failed")
            toast({ title: "Document replaced" })
            setReplaceOpen(false)
            setFile(null)
            onReplaced?.()
          } catch (e: unknown) {
            toast({
              variant: "destructive",
              title: "Replace failed",
              description: e instanceof Error ? e.message : "Replace failed",
            })
          } finally {
            setSaving(false)
          }
        }}
      />
    </div>
  )
}

function ReplaceDialog({
  open,
  onOpenChange,
  file,
  setFile,
  saving,
  onSave,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  file: File | null
  setFile: (f: File | null) => void
  saving: boolean
  onSave: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload document</DialogTitle>
          <DialogDescription>JPG, JPEG, PNG, or PDF up to 10 MB.</DialogDescription>
        </DialogHeader>
        <DocumentUploadField label="Document" value={file} onChange={setFile} required />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!file || saving} onClick={onSave}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

type VehicleCardActionsProps = {
  type: "sale" | "company"
  id: string
  hasDocument: boolean
  onReplaced?: () => void
}

export function VehicleCardActions({
  type,
  id,
  hasDocument,
  onReplaced,
}: VehicleCardActionsProps) {
  const { toast } = useToast()
  const [replaceOpen, setReplaceOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const base = `/api/vehicles/${type}/${id}/card`
  const viewUrl = base
  const downloadUrl = `${base}?download=1`

  const save = async () => {
    if (!file) return
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch(base, {
        method: hasDocument ? "PUT" : "POST",
        body: fd,
        credentials: "include",
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.message || "Upload failed")
      toast({ title: hasDocument ? "Vehicle card replaced" : "Vehicle card uploaded" })
      setReplaceOpen(false)
      setFile(null)
      onReplaced?.()
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: e instanceof Error ? e.message : "Upload failed",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs">
        {hasDocument ? (
          <span className="text-emerald-700">Card uploaded</span>
        ) : (
          <span className="text-muted-foreground">No document uploaded</span>
        )}
      </span>
      <div className="flex flex-wrap gap-1">
        {hasDocument ? (
          <>
            <Button type="button" variant="outline" size="sm" className="h-7" asChild>
              <a href={viewUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1 h-3 w-3" />
                View
              </a>
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-7" asChild>
              <a href={downloadUrl}>
                <Download className="mr-1 h-3 w-3" />
                Download
              </a>
            </Button>
          </>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7"
          onClick={() => setReplaceOpen(true)}
        >
          <Replace className="mr-1 h-3 w-3" />
          {hasDocument ? "Replace" : "Upload"}
        </Button>
      </div>
      <Dialog open={replaceOpen} onOpenChange={setReplaceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vehicle registration card</DialogTitle>
            <DialogDescription>JPG, JPEG, PNG, or PDF up to 10 MB.</DialogDescription>
          </DialogHeader>
          <DocumentUploadField
            label="Vehicle Registration Card"
            value={file}
            onChange={setFile}
            required
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setReplaceOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={!file || saving} onClick={save}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
