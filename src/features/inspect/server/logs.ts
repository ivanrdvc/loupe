import { createServerFn } from '@tanstack/react-start'
import { ensureSession } from '#/lib/auth/guards'
import type { ListLogsOpts } from '#/lib/telemetry'
import { listSessionLogs as listSessionLogsImpl } from '#/lib/telemetry'

export const fetchSessionLogs = createServerFn({ method: 'POST' })
  .inputValidator((opts: ListLogsOpts) => opts)
  .handler(async ({ data }) => {
    await ensureSession()
    return listSessionLogsImpl(data)
  })
