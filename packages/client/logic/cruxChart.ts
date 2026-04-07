/**
 * CrUX history payloads use Unix ms for `time`; lightweight-charts expects
 * `YYYY-MM-DD` business days (or UTCTimestamp in seconds). Passing ms breaks the
 * time scale and charts render empty.
 */
export interface CruxMetricRow {
  time: number
  value: number
}

function rowTimeToChartDay(time: number): string {
  const ms = time > 10_000_000_000 ? time : time * 1000
  return new Date(ms).toISOString().slice(0, 10)
}

function normalizeMetricSeries(rows: CruxMetricRow[] | undefined): { time: string, value: number }[] | undefined {
  if (!rows?.length)
    return rows
  return rows.map(({ time, value }) => ({
    time: rowTimeToChartDay(time),
    value,
  }))
}

/** Mutates nothing; safe to call on API JSON. */
export function normalizeCruxHistoryPayload(payload: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!payload || payload.exists === false)
    return payload

  const out = { ...payload }
  for (const key of ['cls', 'lcp', 'inp', 'fcp', 'fid', 'ttfb'] as const) {
    const series = out[key]
    if (Array.isArray(series))
      out[key] = normalizeMetricSeries(series as CruxMetricRow[])
  }
  return out
}
