type CsvValue = string | number | null | undefined

export function downloadCsv(filename: string, headers: string[], rows: CsvValue[][]) {
  const cell = (v: CsvValue) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [headers, ...rows].map((r) => r.map(cell).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
