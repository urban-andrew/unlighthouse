import type { LocalHistorySummaryPayload } from './localHistoryCache'

export interface CruxMetricPoint {
  time: string
  value: number
}

function parseChartDay(time: string): number {
  return new Date(`${time}T12:00:00.000Z`).getTime()
}

/** Last numeric point in a CrUX history series (sorted ascending by time). */
export function latestCruxValue(series: CruxMetricPoint[] | undefined): number | null {
  if (!series?.length)
    return null
  const last = series[series.length - 1]
  return typeof last?.value === 'number' && !Number.isNaN(last.value) ? last.value : null
}

export function passesCruxBudget(
  value: number | null,
  metric: 'lcp' | 'inp' | 'cls',
  budgets: { lcpMs: number, inpMs: number, cls: number },
): boolean | null {
  if (value == null || Number.isNaN(value))
    return null
  if (metric === 'lcp')
    return value <= budgets.lcpMs
  if (metric === 'inp')
    return value <= budgets.inpMs
  return value <= budgets.cls
}

/**
 * Compare latest point to the newest point at least `minGapDays` calendar days older.
 */
export function cruxFieldRegression(
  series: CruxMetricPoint[] | undefined,
  metric: 'lcp' | 'inp' | 'cls',
  minGapDays: number,
  absThreshold: { lcpMs: number, inpMs: number, cls: number },
): { worsened: boolean, delta: number | null, baseline: number | null, latest: number | null } {
  const latest = latestCruxValue(series)
  if (latest == null || !series?.length)
    return { worsened: false, delta: null, baseline: null, latest: null }

  const lastTs = parseChartDay(series[series.length - 1]!.time)
  const minMs = minGapDays * 86400000
  let baseline: number | null = null
  for (let i = series.length - 2; i >= 0; i--) {
    const ts = parseChartDay(series[i]!.time)
    if (lastTs - ts < minMs)
      continue
    const v = series[i]!.value
    if (typeof v !== 'number' || Number.isNaN(v))
      continue
    baseline = v
    break
  }
  if (baseline == null)
    return { worsened: false, delta: null, baseline: null, latest }

  const delta = latest - baseline
  const thr = metric === 'lcp' ? absThreshold.lcpMs : metric === 'inp' ? absThreshold.inpMs : absThreshold.cls
  const worsened = delta > thr
  return { worsened, delta, baseline, latest }
}

export function labCategoryWeekOverWeek(
  runs: LocalHistorySummaryPayload['runs'] | undefined,
  categoryKey: string,
  minGapDays = 6,
  thresholdPct = -3,
): { deltaPct: number | null, worsened: boolean, thresholdPct: number } {
  if (!runs?.length)
    return { deltaPct: null, worsened: false, thresholdPct }
  const chronological = [...runs].sort((a, b) => +new Date(a.runAt) - +new Date(b.runAt))
  const latest = chronological[chronological.length - 1]
  const latestTs = +new Date(latest!.runAt)
  const minMs = minGapDays * 86400000
  let baseline: typeof latest = undefined
  for (let i = chronological.length - 2; i >= 0; i--) {
    const r = chronological[i]!
    if (latestTs - +new Date(r.runAt) < minMs)
      continue
    baseline = r
    break
  }
  if (!baseline || latest == null)
    return { deltaPct: null, worsened: false, thresholdPct }
  const a = latest.byCategory?.[categoryKey]
  const b = baseline.byCategory?.[categoryKey]
  if (a == null || b == null || Number.isNaN(a) || Number.isNaN(b) || b === 0)
    return { deltaPct: null, worsened: false, thresholdPct }
  const deltaPct = Math.round(((a - b) / b) * 10000) / 100
  return { deltaPct, worsened: deltaPct <= thresholdPct, thresholdPct }
}
