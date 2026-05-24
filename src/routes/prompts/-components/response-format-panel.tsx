import { useState } from 'react'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Textarea } from '#/components/ui/textarea'
import type { ResponseFormat } from '../-types'

type Kind = ResponseFormat['type']

export function ResponseFormatPanel({
  value,
  onChange,
  readOnly,
}: {
  value: ResponseFormat
  onChange?: (next: ResponseFormat) => void
  readOnly?: boolean
}) {
  const apply = (next: ResponseFormat) => {
    if (!readOnly) onChange?.(next)
  }
  const [schemaError, setSchemaError] = useState<string | null>(null)

  const handleKindChange = (next: Kind) => {
    setSchemaError(null)
    if (next === 'json_schema') {
      const existingSchema = value.type === 'json_schema' ? value.schema : ''
      apply({ type: 'json_schema', schema: existingSchema })
    } else if (next === 'json_object') {
      apply({ type: 'json_object' })
    } else {
      apply({ type: 'text' })
    }
  }

  const handleSchemaBlur = () => {
    if (value.type !== 'json_schema') return
    if (!value.schema.trim()) {
      setSchemaError(null)
      return
    }
    try {
      JSON.parse(value.schema)
      setSchemaError(null)
    } catch (err) {
      setSchemaError(`Invalid JSON: ${(err as Error).message}`)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Response format</h3>
      <Select value={value.type} onValueChange={(v) => handleKindChange(v as Kind)} disabled={readOnly}>
        <SelectTrigger size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="text">text</SelectItem>
            <SelectItem value="json_object">json_object</SelectItem>
            <SelectItem value="json_schema">json_schema</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      {value.type === 'json_schema' && (
        <>
          <Textarea
            value={value.schema}
            onChange={(e) => apply({ type: 'json_schema', schema: e.target.value })}
            onBlur={handleSchemaBlur}
            placeholder={'{"type":"object","properties":{...}}'}
            className="font-mono text-xs"
            rows={6}
            readOnly={readOnly}
          />
          {schemaError && <p className="text-xs text-destructive">{schemaError}</p>}
        </>
      )}
    </div>
  )
}
