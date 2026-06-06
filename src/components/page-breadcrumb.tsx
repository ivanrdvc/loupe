import { Link, type LinkProps } from '@tanstack/react-router'
import { Fragment, type ReactNode } from 'react'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '#/components/ui/breadcrumb'

// A crumb with `to` renders as a link; the trailing crumb (no `to`) renders as
// the current page. `className`/`title` style the page crumb (truncation, mono).
export interface Crumb {
  label: ReactNode
  to?: LinkProps['to']
  params?: LinkProps['params']
  search?: LinkProps['search']
  className?: string
  title?: string
}

export function PageBreadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((c, i) => (
          <Fragment key={c.to ?? 'page'}>
            {i > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              {c.to != null ? (
                <BreadcrumbLink asChild>
                  <Link to={c.to} params={c.params} search={c.search}>
                    {c.label}
                  </Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage className={c.className} title={c.title}>
                  {c.label}
                </BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
