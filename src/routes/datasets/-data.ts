import { queryOptions } from '@tanstack/react-query'
import { getDatasetDetail, getDatasetRunDefaults, listDatasets } from '#/features/evaluation/server/datasets'
import { queryKeys } from '#/lib/query-keys'

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
