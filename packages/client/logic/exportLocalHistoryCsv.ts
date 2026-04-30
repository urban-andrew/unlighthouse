import type { LocalHistorySummaryPayload } from './localHistoryCache'
import { HISTORY_PAGE_TYPE_ORDER } from '../constants/pageTypeOrder'

function csvEscape(s: string): string {
  if (/[",\n\r]/.test(s))
    return `"${s.replace(/"/g, '""')}"`
  return s
}

/** Download local history runs as CSV (UTF-8). */
export function downloadLocalHistoryCsv(payload: LocalHistorySummaryPayload, filename = 'unlighthouse-local-history.csv') {
  const runs = [...(payload.runs || [])].sort((a, b) => +new Date(a.runAt) - +new Date(b.runAt))
  const catSet = new Set<string>()
  for (const r of runs) {
    if (r.byCategory)
      Object.keys(r.byCategory).forEach(k => catSet.add(k))
  }
  const cats = catSet.size ? [...catSet].sort() : ['performance', 'accessibility', 'best-practices', 'seo']
  const typeCols = [...HISTORY_PAGE_TYPE_ORDER]

  const header = [
    'runId',
    'runAt',
    'annotation',
    'routeCount',
    'siteAvg',
    ...cats.map(c => `cat_${c}`),
    ...typeCols.flatMap(t => cats.map(c => `cat_${c}_type_${t}`)),
  ]

  const lines = [header.join(',')]
  for (const r of runs) {
    const row = [
      csvEscape(r.runId),
      csvEscape(r.runAt),
      csvEscape(r.annotation || ''),
      String(r.routeCount),
      r.siteAvg == null ? '' : String(r.siteAvg),
      ...cats.map((c) => {
        const v = r.byCategory?.[c]
        return v == null ? '' : String(v)
      }),
      ...typeCols.flatMap(t =>
        cats.map((c) => {
          const v = r.byCategoryByType?.[c]?.[t]
          return v == null ? '' : String(v)
        }),
      ),
    ]
    lines.push(row.join(','))
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
