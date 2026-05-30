import { queryOptions } from '@tanstack/react-query'
import { queryKeys } from '#/lib/query-keys'
import { getDatasetDetail, getDatasetRunDefaults, listDatasets } from '#/server/datasets'

export * from './-types'

export const datasetsListQuery = () =>
  queryOptions({
    queryKey: queryKeys.datasets.list(),
    queryFn: () => listDatasets(),
  })

export const datasetDetailQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.datasets.detail(id),
    queryFn: () => getDatasetDetail({ data: { datasetId: id } }),
  })

export const datasetRunDefaultsQuery = () =>
  queryOptions({
    queryKey: queryKeys.datasets.runDefaults(),
    queryFn: () => getDatasetRunDefaults(),
    staleTime: Number.POSITIVE_INFINITY,
  })
