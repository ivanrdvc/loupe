import type { ReactNode } from 'react'
import { Separator } from '#/components/ui/separator'
import { SidebarTrigger } from '#/components/ui/sidebar'

export function SiteHeader({ title, actions }: { title: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1 md:hidden" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4 md:hidden" />
        {typeof title === 'string' ? <h1 className="text-base font-medium">{title}</h1> : title}
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}
