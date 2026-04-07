import type { ResolvedUserConfig, RuntimeSettings } from '../types'
import { join } from 'pathe'
import fs from 'fs-extra'
import {
  averageScores,
  classifyPagePath,
  emptyByType,
  type PageType,
  PAGE_TYPE_ORDER,
} from './pageType'

export interface LocalHistoryRouteRow {
  path: string
  score: number
  categories: Record<string, number | null>
  pageType?: PageType
}

export interface LocalHistoryRunSummary {
  runId: string
  runAt: string
  siteAvg: number | null
  routeCount: number
  byType: Record<PageType, number | null>
}

export interface LocalHistoryWow {
  siteAvgDeltaPct: number | null
  byType: Record<PageType, number | null>
}

/** Deltas vs different baselines (latest run is always the “current” side). */
export interface LocalHistoryComparisons {
  /** Immediate previous scan in history (same as legacy top-level `wow`). */
  consecutive: LocalHistoryWow | null
  /** Latest run vs most recent run on the previous UTC calendar day. */
  dod: LocalHistoryWow | null
  /** Latest run vs most recent run at least ~7 days older. */
  wow: LocalHistoryWow | null
  /** Latest run vs most recent run at least ~30 days older. */
  mom: LocalHistoryWow | null
  /** Latest run vs most recent run at least ~365 days older. */
  yoy: LocalHistoryWow | null
}

export interface LocalHistorySummaryResponse {
  enabled: true
  /** Completed scans in chronological order (oldest → newest). */
  runs: LocalHistoryRunSummary[]
  /** At most one snapshot per UTC calendar day (latest run that day); for charting as daily points. */
  runsDaily: LocalHistoryRunSummary[]
  comparisons: LocalHistoryComparisons
  /** @deprecated Use `comparisons.consecutive` — kept for older clients. */
  wow: LocalHistoryWow | null
}

function pctDelta(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || Number.isNaN(previous) || previous === 0)
    return null
  return Math.round(((current - previous) / previous) * 10000) / 100
}

function routesWithTypes(routes: LocalHistoryRouteRow[]): LocalHistoryRouteRow[] {
  return routes.map((r) => {
    const pageType = r.pageType ?? classifyPagePath(r.path)
    return { ...r, pageType }
  })
}

function summarizeRun(runId: string, runAt: string, routes: LocalHistoryRouteRow[]): LocalHistoryRunSummary {
  const typed = routesWithTypes(routes)
  const scores = typed.map(r => r.score).filter(v => typeof v === 'number' && !Number.isNaN(v))
  const siteAvg = averageScores(scores)
  const byType = emptyByType()
  for (const t of PAGE_TYPE_ORDER) {
    const vals = typed.filter(r => r.pageType === t).map(r => r.score)
    byType[t] = averageScores(vals)
  }
  return {
    runId,
    runAt,
    siteAvg,
    routeCount: routes.length,
    byType,
  }
}

function buildWow(latest: LocalHistoryRunSummary, previous: LocalHistoryRunSummary): LocalHistoryWow {
  const byType = emptyByType()
  for (const t of PAGE_TYPE_ORDER)
    byType[t] = pctDelta(latest.byType[t], previous.byType[t])
  return {
    siteAvgDeltaPct: pctDelta(latest.siteAvg, previous.siteAvg),
    byType,
  }
}

function utcDayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10)
}

/** One point per UTC day: last completed scan that day wins (chronological input). */
function buildRunsDaily(runsChronological: LocalHistoryRunSummary[]): LocalHistoryRunSummary[] {
  const byDay = new Map<string, LocalHistoryRunSummary>()
  for (const r of runsChronological) {
    const day = utcDayKey(r.runAt)
    byDay.set(day, r)
  }
  return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v)
}

/** Latest run on the previous UTC calendar day (if any). */
function findBaselinePreviousDay(latest: LocalHistoryRunSummary, newestFirst: LocalHistoryRunSummary[]): LocalHistoryRunSummary | null {
  const latestDay = utcDayKey(latest.runAt)
  const d = new Date(`${latestDay}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  const prevKey = d.toISOString().slice(0, 10)
  let best: LocalHistoryRunSummary | null = null
  for (const r of newestFirst) {
    if (utcDayKey(r.runAt) !== prevKey)
      continue
    if (!best || +new Date(r.runAt) > +new Date(best.runAt))
      best = r
  }
  return best
}

/** Most recent run that is at least `minDays` older than `latest` (by wall-clock gap). */
function findBaselineMinimumDaysAgo(latest: LocalHistoryRunSummary, newestFirst: LocalHistoryRunSummary[], minDays: number): LocalHistoryRunSummary | null {
  const latestTs = +new Date(latest.runAt)
  const minMs = minDays * 24 * 60 * 60 * 1000
  let best: LocalHistoryRunSummary | null = null
  let bestTs = -Infinity
  for (const r of newestFirst) {
    if (r.runId === latest.runId)
      continue
    const rTs = +new Date(r.runAt)
    if (latestTs - rTs < minMs)
      continue
    if (rTs > bestTs) {
      best = r
      bestTs = rTs
    }
  }
  return best
}

function buildComparisons(newestFirst: LocalHistoryRunSummary[]): LocalHistoryComparisons {
  if (newestFirst.length === 0) {
    return {
      consecutive: null,
      dod: null,
      wow: null,
      mom: null,
      yoy: null,
    }
  }
  const latest = newestFirst[0]!
  const consecutive = newestFirst.length >= 2 ? buildWow(latest, newestFirst[1]!) : null
  const dodPrev = findBaselinePreviousDay(latest, newestFirst)
  const dod = dodPrev ? buildWow(latest, dodPrev) : null
  const wowPrev = findBaselineMinimumDaysAgo(latest, newestFirst, 7)
  const wow = wowPrev ? buildWow(latest, wowPrev) : null
  const momPrev = findBaselineMinimumDaysAgo(latest, newestFirst, 30)
  const mom = momPrev ? buildWow(latest, momPrev) : null
  const yoyPrev = findBaselineMinimumDaysAgo(latest, newestFirst, 365)
  const yoy = yoyPrev ? buildWow(latest, yoyPrev) : null
  return { consecutive, dod, wow, mom, yoy }
}

/**
 * Reads `.unlighthouse/<subdir>/index.json` and each `run.json`; returns data for the Historical dashboard.
 */
export async function readLocalHistorySummary(
  resolvedConfig: ResolvedUserConfig,
  runtimeSettings: RuntimeSettings,
): Promise<LocalHistorySummaryResponse | null> {
  const opts = resolvedConfig.localHistory
  if (opts === false || !opts || typeof opts !== 'object' || !opts.enabled)
    return null

  const subdir = opts.subdir ?? 'history'
  const baseDir = join(runtimeSettings.outputPath, subdir)
  const indexPath = join(baseDir, 'index.json')
  if (!await fs.pathExists(indexPath)) {
    return {
      enabled: true,
      runs: [],
      runsDaily: [],
      comparisons: {
        consecutive: null,
        dod: null,
        wow: null,
        mom: null,
        yoy: null,
      },
      wow: null,
    }
  }

  let index: { runs?: string[] }
  try {
    index = (await fs.readJson(indexPath)) as { runs?: string[] }
  }
  catch {
    return {
      enabled: true,
      runs: [],
      runsDaily: [],
      comparisons: {
        consecutive: null,
        dod: null,
        wow: null,
        mom: null,
        yoy: null,
      },
      wow: null,
    }
  }

  const runIds = Array.isArray(index.runs) ? index.runs : []
  const summaries: LocalHistoryRunSummary[] = []

  for (const runId of runIds) {
    if (!runId || typeof runId !== 'string')
      continue
    const p = join(baseDir, runId, 'run.json')
    if (!await fs.pathExists(p))
      continue
    let snap: { runAt?: string, routes?: LocalHistoryRouteRow[] }
    try {
      snap = (await fs.readJson(p)) as { runAt?: string, routes?: LocalHistoryRouteRow[] }
    }
    catch {
      continue
    }
    const routes = Array.isArray(snap.routes) ? snap.routes : []
    const runAt = typeof snap.runAt === 'string' ? snap.runAt : new Date().toISOString()
    summaries.push(summarizeRun(runId, runAt, routes))
  }

  // Newest first (index.json stores newest first)
  const newestFirst = [...summaries]
  const comparisons = buildComparisons(newestFirst)
  const wow = comparisons.consecutive

  // Chart: oldest → newest (time asc)
  const runsChronological = [...newestFirst].reverse()
  const runsDaily = buildRunsDaily(runsChronological)

  return {
    enabled: true,
    runs: runsChronological,
    runsDaily,
    comparisons,
    wow,
  }
}
