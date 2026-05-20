import { Add01Icon, Delete02Icon, Edit02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useState } from 'react'
import { Button } from '#/components/ui/button'
import { Card, CardContent } from '#/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Textarea } from '#/components/ui/textarea'
import type { Tool } from '../-types'

export function ToolsPanel({ tools, onChange }: { tools: Tool[]; onChange: (tools: Tool[]) => void }) {
  const [editing, setEditing] = useState<{ index: number; tool: Tool } | null>(null)
  const [open, setOpen] = useState(false)

  const openCreate = () => {
    setEditing({ index: -1, tool: { name: '', description: '', parameters: '' } })
    setOpen(true)
  }

  const openEdit = (index: number) => {
    setEditing({ index, tool: { ...tools[index] } })
    setOpen(true)
  }

  const remove = (index: number) => {
    onChange(tools.filter((_, i) => i !== index))
  }

  const save = (tool: Tool) => {
    if (!editing) return
    if (editing.index < 0) onChange([...tools, tool])
    else {
      const copy = [...tools]
      copy[editing.index] = tool
      onChange(copy)
    }
    setOpen(false)
    setEditing(null)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Tools</h3>
        <Button variant="outline" size="sm" onClick={openCreate}>
          <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
          Add
        </Button>
      </div>
      {tools.length === 0 ? (
        <p className="text-xs text-muted-foreground">No tools defined.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {tools.map((tool, idx) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: tools are unnamed-allowed and reorderable only via remove; index is stable per render
            <Card key={idx} size="sm">
              <CardContent className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-mono text-xs font-medium text-foreground">{tool.name || '(unnamed)'}</span>
                  {tool.description && (
                    <span className="line-clamp-2 text-[11px] text-muted-foreground">{tool.description}</span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon-sm" onClick={() => openEdit(idx)} aria-label="Edit tool">
                    <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => remove(idx)} aria-label="Delete tool">
                    <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <ToolDialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value)
          if (!value) setEditing(null)
        }}
        initial={editing?.tool ?? null}
        onSave={save}
      />
    </div>
  )
}

function ToolDialog({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial: Tool | null
  onSave: (tool: Tool) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [parameters, setParameters] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && initial) {
      setName(initial.name)
      setDescription(initial.description)
      setParameters(initial.parameters)
      setError(null)
    }
  }, [open, initial])

  const handleSave = () => {
    if (parameters.trim()) {
      try {
        JSON.parse(parameters)
      } catch (err) {
        setError(`Invalid JSON: ${(err as Error).message}`)
        return
      }
    }
    setError(null)
    onSave({ name: name.trim(), description: description.trim(), parameters })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial?.name ? 'Edit tool' : 'New tool'}</DialogTitle>
          <DialogDescription>Define the tool the model can call.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tool-name">Name</Label>
            <Input
              id="tool-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="get_weather"
              className="font-mono"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tool-description">Description</Label>
            <Textarea
              id="tool-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Get current weather for a city."
              rows={2}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tool-parameters">Parameters (JSON schema)</Label>
            <Textarea
              id="tool-parameters"
              value={parameters}
              onChange={(e) => setParameters(e.target.value)}
              placeholder={'{"type":"object","properties":{...}}'}
              rows={6}
              className="font-mono text-xs"
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
