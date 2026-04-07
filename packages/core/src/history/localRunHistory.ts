import type { ResolvedUserConfig, RuntimeSettings, UnlighthouseRouteReport } from '../types'
import fs from 'fs-extra'
import { join } from 'pathe'
import { useLogger } from '../logger'
import { classifyPagePath } from './pageType'
import { writeLocalHistoryDashboard } from './localHistoryDashboard'

/**
 * Append a snapshot of the current run under `outputPath/<subdir>/<iso-timestamp>/run.json`
 * and maintain `index.json` with a list of recent runs (for local comparison).
 */
export async function persistLocalRunHistory(
  resolvedConfig: ResolvedUserConfig,
  runtimeSettings: RuntimeSettings,
  routeReports: Map<string, UnlighthouseRouteReport>,
): Promise<void> {
  const opts = resolvedConfig.localHistory
  if (opts === false || !opts.enabled)
    return

  const maxRuns = opts.maxRuns ?? 20
  const subdir = opts.subdir ?? 'history'
  const baseDir = join(runtimeSettings.outputPath, subdir)
  const runId = new Date().toISOString().replace(/[:.]/g, '-')
  const runDir = join(baseDir, runId)

  const routes = [...routeReports.values()]
    .filter(r => r.tasks.runLighthouseTask === 'completed' && r.report)
    .map((r) => {
      const categories: Record<string, number | null> = {}
      for (const c of r.report!.categories || []) {
        if (c && 'key' in c && c.key)
          categories[String(c.key)] = c.score ?? null
      }
      return {
        path: r.route.path,
        pageType: classifyPagePath(r.route.path),
        score: r.report!.score,
        categories,
      }
    })

  await fs.ensureDir(runDir)
  const manifest = {
    runAt: new Date().toISOString(),
    site: resolvedConfig.site,
    configCacheKey: runtimeSettings.configCacheKey,
    routeCount: routes.length,
    routes,
  }
  await fs.writeJson(join(runDir, 'run.json'), manifest, { spaces: 2 })

  const indexPath = join(baseDir, 'index.json')
  let runs: string[] = []
  if (await fs.pathExists(indexPath))
    runs = ((await fs.readJson(indexPath)) as { runs?: string[] }).runs || []

  runs.unshift(runId)
  if (runs.length > maxRuns) {
    const drop = runs.slice(maxRuns)
    runs = runs.slice(0, maxRuns)
    for (const id of drop)
      await fs.remove(join(baseDir, id))
  }
  await fs.writeJson(indexPath, { runs, latest: runId }, { spaces: 2 })

  if (opts.dashboard !== false) {
    await writeLocalHistoryDashboard(baseDir).catch((e: unknown) => {
      try {
        useLogger().warn('Failed to write local history dashboard.', e)
      }
      catch {
        console.warn('[unlighthouse] Failed to write local history dashboard.', e)
      }
    })
  }
}
