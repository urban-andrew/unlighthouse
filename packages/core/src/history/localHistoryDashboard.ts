import fs from 'fs-extra'
import { join } from 'pathe'

interface RunSnapshot {
  runAt: string
  site: string
  configCacheKey?: string
  routeCount: number
  routes: Array<{ path: string, score: number, categories: Record<string, number | null> }>
}

interface RunRow extends RunSnapshot {
  runId: string
  avgScore: number | null
  avgPerformance: number | null
}

function averageCategory(routes: RunSnapshot['routes'], key: string): number | null {
  const vals = routes
    .map(r => r?.categories?.[key])
    .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v))
  if (!vals.length)
    return null
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
}

function pct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n))
    return '—'
  return `${Math.round(n * 100)}%`
}

/**
 * Static HTML overview of all runs under `baseDir` (reads index.json and each run folder's run.json).
 */
export async function writeLocalHistoryDashboard(baseDir: string): Promise<void> {
  try {
    await writeLocalHistoryDashboardInner(baseDir)
  }
  catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    await writeDashboardError(baseDir, msg).catch(() => {})
  }
}

async function writeLocalHistoryDashboardInner(baseDir: string): Promise<void> {
  const indexPath = join(baseDir, 'index.json')
  if (!await fs.pathExists(indexPath))
    return

  let index: { runs?: string[] }
  try {
    index = (await fs.readJson(indexPath)) as { runs?: string[] }
  }
  catch {
    await writeDashboardError(
      baseDir,
      'Could not read index.json. Delete history/ and run a new scan, or fix the file.',
    )
    return
  }

  const runIds = Array.isArray(index.runs) ? index.runs : []
  const rows: RunRow[] = []
  for (const runId of runIds) {
    if (!runId || typeof runId !== 'string')
      continue
    const p = join(baseDir, runId, 'run.json')
    if (!await fs.pathExists(p))
      continue
    let snap: RunSnapshot
    try {
      snap = (await fs.readJson(p)) as RunSnapshot
    }
    catch {
      continue
    }
    const routeList = Array.isArray(snap.routes) ? snap.routes : []
    const runAt = typeof snap.runAt === 'string' ? snap.runAt : new Date().toISOString()
    const avgScore = routeList.length
      ? routeList.reduce((a, r) => a + (r?.score ?? 0), 0) / routeList.length
      : null
    rows.push({
      runId,
      site: typeof snap.site === 'string' ? snap.site : '',
      configCacheKey: snap.configCacheKey,
      routeCount: typeof snap.routeCount === 'number' ? snap.routeCount : routeList.length,
      routes: routeList,
      runAt,
      avgScore,
      avgPerformance: averageCategory(routeList, 'performance'),
    })
  }

  const tableRows = rows.map((r) => {
    const bar = r.avgScore !== null && !Number.isNaN(r.avgScore) ? Math.round(r.avgScore * 100) : 0
    const safeAt = typeof r.runAt === 'string' ? r.runAt : ''
    const dt = esc(safeAt.slice(0, 19).replace('T', ' '))
    return [
      '<tr>',
      '<td><time datetime="' + esc(r.runAt) + '">' + dt + '</time></td>',
      '<td>' + String(r.routeCount) + '</td>',
      '<td>' + pct(r.avgScore) + '</td>',
      '<td>' + pct(r.avgPerformance) + '</td>',
      '<td><span class="bar" style="--w:' + String(bar) + '%"></span></td>',
      '</tr>',
    ].join('')
  }).join('\n')

  const site = rows[0]?.site ? esc(rows[0].site) : ''
  const titleSuffix = site ? ' — ' + site : ''
  const metaLine = site
    ? 'Site: <strong>' + site + '</strong> · Newest runs first. Open via a static server (e.g. <code>npx sirv .unlighthouse</code>) if needed.'
    : 'Newest runs first. Open via a static server (e.g. <code>npx sirv .unlighthouse</code>) if needed.'

  const bodyRows = tableRows || '<tr><td colspan="5">No snapshots yet.</td></tr>'

  const html = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Unlighthouse local history' + titleSuffix + '</title>',
    '<style>',
    ':root { font-family: system-ui, sans-serif; background: #0f1419; color: #e6edf3; }',
    'body { max-width: 960px; margin: 2rem auto; padding: 0 1rem; }',
    'h1 { font-size: 1.25rem; font-weight: 600; }',
    'p.meta { color: #8b949e; font-size: 0.875rem; margin-bottom: 1.5rem; }',
    'table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }',
    'th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid #30363d; }',
    'th { color: #8b949e; font-weight: 500; }',
    'tr:hover td { background: #161b22; }',
    '.bar { display: block; height: 6px; background: linear-gradient(90deg, #238636, #3fb950); border-radius: 2px; width: var(--w, 0%); max-width: 100%; }',
    'footer { margin-top: 2rem; font-size: 0.75rem; color: #6e7681; }',
    '</style>',
    '</head>',
    '<body>',
    '<h1>Local run history</h1>',
    '<p class="meta">' + metaLine + '</p>',
    '<table>',
    '<thead><tr><th>Run</th><th>Routes</th><th>Avg score</th><th>Avg performance</th><th></th></tr></thead>',
    '<tbody>',
    bodyRows,
    '</tbody>',
    '</table>',
    '<footer>Generated by Unlighthouse <code>localHistory</code>. Compare JSON under <code>history/&lt;timestamp&gt;/run.json</code>.</footer>',
    '</body>',
    '</html>',
  ].join('\n')

  await fs.ensureDir(baseDir)
  await fs.writeFile(join(baseDir, 'dashboard.html'), html, 'utf8')
}

async function writeDashboardError(baseDir: string, message: string): Promise<void> {
  const escMsg = esc(message)
  const html = [
    '<!DOCTYPE html>',
    '<html lang="en"><head><meta charset="utf-8"><title>Unlighthouse history error</title>',
    '<style>body{font-family:system-ui;padding:2rem;max-width:560px;margin:auto;background:#1a1a1a;color:#eee}</style>',
    '</head><body>',
    '<h1>Dashboard could not be generated</h1>',
    '<p>' + escMsg + '</p>',
    '<p style="opacity:.85;font-size:14px">Tip: open via <code>npx sirv .unlighthouse</code> and visit <code>/history/dashboard.html</code> (opening the file directly as <code>file://</code> is fine for this static page).</p>',
    '</body></html>',
  ].join('\n')
  await fs.ensureDir(baseDir)
  await fs.writeFile(join(baseDir, 'dashboard.html'), html, 'utf8')
}
