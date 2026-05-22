import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '#/components/ui/accordion'
import { Badge } from '#/components/ui/badge'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '#/components/ui/empty'
import { formatJson } from '#/lib/json'
import type { SystemBlock, ToolDef, ToolGroup } from './context-collectors'

export function ContextSystem({ blocks }: { blocks: SystemBlock[] }) {
  if (blocks.length === 0) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyTitle>No system prompt</EmptyTitle>
          <EmptyDescription>None of the chat spans carry a system message.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <Accordion type="multiple" defaultValue={blocks.length > 0 ? [blocks[0].id] : []}>
      {blocks.map((block) => (
        <AccordionItem key={block.id} value={block.id}>
          <AccordionTrigger>
            <span className="min-w-0 flex-1 truncate">{block.title}</span>
            <Badge variant="secondary" className="tabular-nums">
              {block.tokens.toLocaleString()} tok
            </Badge>
          </AccordionTrigger>
          <AccordionContent>
            <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">
              {block.content}
            </pre>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}

export function ContextTools({ groups }: { groups: ToolGroup[] }) {
  if (groups.length === 0) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyTitle>No tool definitions</EmptyTitle>
          <EmptyDescription>The chat spans didn't advertise any tools.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  const wrapped = groups.filter((g) => g.kind !== 'default')
  const flat = groups.find((g) => g.kind === 'default')?.tools ?? []
  return (
    <div className="space-y-3">
      {wrapped.length > 0 && (
        <Accordion type="multiple">
          {wrapped.map((group) => {
            const value = `${group.kind}:${group.domain}`
            return (
              <AccordionItem key={value} value={value}>
                <AccordionTrigger>
                  <span className="min-w-0 flex-1 truncate">{group.domain}</span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge variant="secondary" className="tabular-nums">
                      {group.tools.length} tool{group.tools.length === 1 ? '' : 's'}
                    </Badge>
                    <Badge variant="outline" className="tabular-nums">
                      {group.tokens.toLocaleString()} tok
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-0">
                  <div className="divide-y divide-border border-border border-t">
                    {group.tools.map((tool) => (
                      <ToolRow key={tool.id} tool={tool} />
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>
      )}
      {flat.length > 0 && (
        <div className="divide-y divide-border overflow-hidden rounded-md border bg-muted/50">
          {flat.map((tool) => (
            <ToolRow key={tool.id} tool={tool} />
          ))}
        </div>
      )}
    </div>
  )
}

function ToolRow({ tool }: { tool: ToolDef }) {
  return (
    <details className="group">
      <summary className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2 text-xs">
        <span className="min-w-0">
          <span className="block truncate font-medium text-foreground">{tool.name}</span>
          {tool.description && <span className="mt-0.5 block truncate text-muted-foreground">{tool.description}</span>}
        </span>
        <Badge variant="outline" className="tabular-nums">
          {tool.tokens.toLocaleString()} tok
        </Badge>
      </summary>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words bg-card/70 px-3 py-2 text-xs leading-snug text-foreground">
        {formatJson(tool.raw)}
      </pre>
    </details>
  )
}
