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

export interface LocalHistorySummaryResponse {
  enabled: true
  runs: LocalHistoryRunSummary[]
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
  const wow = newestFirst.length >= 2 ? buildWow(newestFirst[0]!, newestFirst[1]!) : null

  // Chart: oldest → newest (time asc)
  const runsChronological = [...newestFirst].reverse()

  return {
    enabled: true,
    runs: runsChronological,
    wow,
  }
}
