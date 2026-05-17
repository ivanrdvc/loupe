import type { ReactNode } from 'react'
import { SiteHeader } from '#/components/site-header'

export function Page({ title, actions, children }: { title: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <SiteHeader title={title} actions={actions} />
      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">{children}</div>
        </div>
      </div>
    </div>
  )
}
