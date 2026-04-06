import type { Flags, Result } from 'lighthouse'
import type { LighthouseReport, PuppeteerTask, UnlighthouseRouteReport } from '../../types'
import type { Page } from 'puppeteer-core'
import { join } from 'node:path'
import fs from 'fs-extra'
import { computeMedianRun } from 'lighthouse/core/lib/median-run.js'
import { map, pick, sumBy } from 'lodash-es'
import { normalize, relative } from 'pathe'
import { withQuery } from 'ufo'
import { applyFormFactorFlags } from '../../lighthouseFormFactor'
import { useLogger } from '../../logger'
import { useUnlighthouse } from '../../unlighthouse'
import { base64ToBuffer, ReportArtifacts } from '../../util'
import { setupPage } from '../util'

export function normaliseLighthouseResult(route: UnlighthouseRouteReport, result: Result): LighthouseReport {
  const { resolvedConfig, runtimeSettings } = useUnlighthouse()

  const measuredCategories = Object.values(result.categories)
    .filter(c => typeof c.score !== 'undefined') as { score: number }[]

  const columnFields = Object.values(resolvedConfig.client.columns)
    .flat()
    .filter(c => !!c.key)
    .map(c => c.key?.replace('report.', '')) as string[]

  const imageIssues = [
    result.audits['unsized-images'],
    result.audits['preload-lcp-image'],
    result.audits['offscreen-images'],
    result.audits['modern-image-formats'],
    result.audits['uses-optimized-images'],
    result.audits['efficient-animated-content'],
    result.audits['uses-responsive-images'],
  ]
    .map(d => (d?.details as any)?.items || [])
    .flat()
  const ariaIssues = Object.values(result.audits)
    // @ts-expect-error untyped
    .filter(a => a && a.id.startsWith('aria-') && a.details?.items?.length > 0)
    // @ts-expect-error untyped
    .map(a => a.details?.items)
    .flat()
  // @ts-expect-error untyped
  if (result.audits['screenshot-thumbnails']?.details?.items) {
    // need to convert the base64 screenshot-thumbnails into their file name
    // @ts-expect-error untyped
    for (const k in result.audits['screenshot-thumbnails'].details.items)
      // @ts-expect-error untyped
      result.audits['screenshot-thumbnails'].details.items[k].data = relative(runtimeSettings.generatedClientPath, join(route.artifactPath, ReportArtifacts.screenshotThumbnailsDir, `${k}.jpeg`))
  }
  // map the json report to what values we actually need
  return {
    // @ts-expect-error type override
    categories: map(result.categories, (c, k) => {
      return {
        key: k,
        id: k,
        ...pick(c, ['title', 'score']),
      }
    }),
    ...pick(result, [
      'fetchTime',
      'audits.redirects',
      // core web vitals
      'audits.layout-shifts',
      'audits.largest-contentful-paint-element',
      'audits.largest-contentful-paint',
      'audits.cumulative-layout-shift',
      'audits.first-contentful-paint',
      'audits.total-blocking-time',
      'audits.max-potential-fid',
      'audits.interactive',
      ...columnFields,
    ]),
    computed: {
      imageIssues: {
        details: {
          items: imageIssues,
        },
        displayValue: imageIssues.length,
        score: imageIssues.length > 0 ? 0 : 1,
      },
      ariaIssues: {
        details: {
          items: ariaIssues,
        },
        displayValue: ariaIssues.length,
        score: ariaIssues.length > 0 ? 0 : 1,
      },
    },
    score: Math.round(sumBy(measuredCategories, 'score') / measuredCategories.length * 100) / 100,
  }
}

export function pickPrimaryReport(
  by: Partial<Record<'mobile' | 'desktop', LighthouseReport>>,
  device: 'mobile' | 'desktop' | false,
): LighthouseReport | undefined {
  const key = device === 'desktop' ? 'desktop' : 'mobile'
  return by[key] ?? by.mobile ?? by.desktop
}

async function persistLighthouseBinaryArtifacts(artifactPath: string, report: Result) {
  // @ts-expect-error untyped
  if (report.audits?.['final-screenshot']?.details?.data)
    // @ts-expect-error untyped
    await fs.writeFile(join(artifactPath, ReportArtifacts.screenshot), base64ToBuffer(report.audits['final-screenshot'].details.data))

  if (report.fullPageScreenshot?.screenshot.data)
    await fs.writeFile(join(artifactPath, ReportArtifacts.fullScreenScreenshot), base64ToBuffer(report.fullPageScreenshot.screenshot.data))

  const screenshotThumbnails = report.audits?.['screenshot-thumbnails']?.details
  await fs.mkdir(join(artifactPath, ReportArtifacts.screenshotThumbnailsDir), { recursive: true })
  // @ts-expect-error untyped
  if (screenshotThumbnails?.items && screenshotThumbnails.type === 'filmstrip') {
    for (const key in screenshotThumbnails.items) {
      const thumbnail = screenshotThumbnails.items[key]
      await fs.writeFile(join(artifactPath, ReportArtifacts.screenshotThumbnailsDir, `${key}.jpeg`), base64ToBuffer(thumbnail.data))
    }
  }
}

async function executeLighthouseRun(
  routeReport: UnlighthouseRouteReport,
  artifactPath: string,
  lighthouseOptions: Flags,
  page: Page,
  routeUrl: string,
): Promise<Result | 'failed' | 'failed-retry'> {
  const logger = useLogger()
  const { resolvedConfig, runtimeSettings } = useUnlighthouse()

  const reportJsonPath = join(artifactPath, ReportArtifacts.reportJson)
  if (resolvedConfig.cache && fs.existsSync(reportJsonPath)) {
    try {
      return fs.readJsonSync(reportJsonPath, { encoding: 'utf-8' }) as Result
    }
    catch (e) {
      logger.warn(`Failed to read cached lighthouse report for path "${routeReport.route.path}" (${artifactPath}).`, e)
    }
  }

  const routeReportForArgs = {
    route: { url: routeUrl },
    artifactPath: normalize(artifactPath),
  }

  const args = [
    `--cache=${JSON.stringify(resolvedConfig.cache)}`,
    `--routeReport=${JSON.stringify(routeReportForArgs)}`,
    `--lighthouseOptions=${JSON.stringify(lighthouseOptions)}`,
    `--port=${new URL(page.browser().wsEndpoint()).port}`,
  ]

  const samples: Result[] = []
  for (let i = 0; i < resolvedConfig.scanner.samples; i++) {
    try {
      const { x } = await import('tinyexec')
      const res = await x(
        runtimeSettings.lighthouseProcessPath.endsWith('.ts') ? 'jiti' : 'node',
        [runtimeSettings.lighthouseProcessPath, ...args],
        {
          timeout: 6 * 60 * 1000,
          nodeOptions: { stdio: ['pipe', 'inherit', 'inherit'] },
        },
      )
      if (res)
        samples.push(fs.readJsonSync(reportJsonPath))
    }
    catch (e: any) {
      logger.error('Failed to run lighthouse for route', e)
      return 'failed'
    }
  }

  let report: Result | undefined = samples[0]

  if (!report) {
    logger.error(`Task \`runLighthouseTask\` has failed to run for path "${routeReport.route.path}".`)
    return 'failed'
  }

  if (report.categories.performance && !report.categories.performance.score) {
    logger.warn(`Lighthouse failed to run performance audits for "${routeReport.route.path}", adding back to queue${report.runtimeError ? `: ${report.runtimeError.message}` : '.'}`)
    return 'failed-retry'
  }

  if (samples.length > 1) {
    try {
      report = computeMedianRun(samples)
    }
    catch (e) {
      logger.warn('Error when computing median score, possibly audit failed.', e)
    }
  }

  return report
}

export const runLighthouseTask: PuppeteerTask = async (props) => {
  const logger = useLogger()
  const { resolvedConfig } = useUnlighthouse()
  const { page, data: routeReport } = props

  const dualDevice = !!resolvedConfig.scanner.dualDevice

  if (dualDevice && routeReport._refreshFormFactorOnly) {
    const only = routeReport._refreshFormFactorOnly
    delete routeReport._refreshFormFactorOnly
    await setupPage(page)
    const clonedRouteReport = { ...routeReport }
    if (resolvedConfig.defaultQueryParams)
      clonedRouteReport.route.url = withQuery(clonedRouteReport.route.url, resolvedConfig.defaultQueryParams)
    const routeUrl = clonedRouteReport.route.url
    const subPath = join(routeReport.artifactPath, only)
    await fs.mkdir(subPath, { recursive: true })
    const flags = applyFormFactorFlags(resolvedConfig.lighthouseOptions, only)
    const outcome = await executeLighthouseRun(routeReport, subPath, flags, page, routeUrl)
    if (outcome === 'failed') {
      routeReport.tasks.runLighthouseTask = 'failed'
      return routeReport
    }
    if (outcome === 'failed-retry') {
      routeReport.tasks.runLighthouseTask = 'failed-retry'
      return routeReport
    }
    await persistLighthouseBinaryArtifacts(subPath, outcome)
    const normalized = normaliseLighthouseResult({ ...routeReport, artifactPath: subPath }, outcome)
    routeReport.reportByFormFactor = {
      ...routeReport.reportByFormFactor,
      [only]: normalized,
    }
    routeReport.report = pickPrimaryReport(routeReport.reportByFormFactor, resolvedConfig.scanner.device)
    return routeReport
  }

  if (dualDevice) {
    const mobileJson = join(routeReport.artifactPath, 'mobile', ReportArtifacts.reportJson)
    const desktopJson = join(routeReport.artifactPath, 'desktop', ReportArtifacts.reportJson)
    if (resolvedConfig.cache && fs.existsSync(mobileJson) && fs.existsSync(desktopJson)) {
      try {
        const mobileResult = fs.readJsonSync(mobileJson, { encoding: 'utf-8' }) as Result
        const desktopResult = fs.readJsonSync(desktopJson, { encoding: 'utf-8' }) as Result
        const mobilePath = join(routeReport.artifactPath, 'mobile')
        const desktopPath = join(routeReport.artifactPath, 'desktop')
        routeReport.reportByFormFactor = {
          mobile: normaliseLighthouseResult({ ...routeReport, artifactPath: mobilePath }, mobileResult),
          desktop: normaliseLighthouseResult({ ...routeReport, artifactPath: desktopPath }, desktopResult),
        }
        routeReport.report = pickPrimaryReport(routeReport.reportByFormFactor, resolvedConfig.scanner.device)
        return routeReport
      }
      catch (e) {
        logger.warn(`Failed to read cached dual lighthouse reports for path "${routeReport.route.path}".`, e)
      }
    }
  }
  else {
    const reportJsonPath = join(routeReport.artifactPath, ReportArtifacts.reportJson)
    if (resolvedConfig.cache && fs.existsSync(reportJsonPath)) {
      try {
        const report = fs.readJsonSync(reportJsonPath, { encoding: 'utf-8' }) as Result
        routeReport.report = normaliseLighthouseResult(routeReport, report)
        return routeReport
      }
      catch (e) {
        logger.warn(`Failed to read cached lighthouse report for path "${routeReport.route.path}".`, e)
      }
    }
  }

  await setupPage(page)

  const clonedRouteReport = { ...routeReport }
  if (resolvedConfig.defaultQueryParams)
    clonedRouteReport.route.url = withQuery(clonedRouteReport.route.url, resolvedConfig.defaultQueryParams)

  const routeUrl = clonedRouteReport.route.url

  if (dualDevice) {
    const factors = ['mobile', 'desktop'] as const
    const byForm: Partial<Record<'mobile' | 'desktop', LighthouseReport>> = {}
    for (const factor of factors) {
      const subPath = join(routeReport.artifactPath, factor)
      await fs.mkdir(subPath, { recursive: true })
      const flags = applyFormFactorFlags(resolvedConfig.lighthouseOptions, factor)
      const outcome = await executeLighthouseRun(routeReport, subPath, flags, page, routeUrl)
      if (outcome === 'failed') {
        routeReport.tasks.runLighthouseTask = 'failed'
        return routeReport
      }
      if (outcome === 'failed-retry') {
        routeReport.tasks.runLighthouseTask = 'failed-retry'
        return routeReport
      }
      await persistLighthouseBinaryArtifacts(subPath, outcome)
      byForm[factor] = normaliseLighthouseResult({ ...routeReport, artifactPath: subPath }, outcome)
    }
    routeReport.reportByFormFactor = {
      mobile: byForm.mobile!,
      desktop: byForm.desktop!,
    }
    routeReport.report = pickPrimaryReport(routeReport.reportByFormFactor, resolvedConfig.scanner.device)
    return routeReport
  }

  const outcome = await executeLighthouseRun(
    routeReport,
    routeReport.artifactPath,
    resolvedConfig.lighthouseOptions,
    page,
    routeUrl,
  )
  if (outcome === 'failed') {
    routeReport.tasks.runLighthouseTask = 'failed'
    return routeReport
  }
  if (outcome === 'failed-retry') {
    routeReport.tasks.runLighthouseTask = 'failed-retry'
    return routeReport
  }

  await persistLighthouseBinaryArtifacts(routeReport.artifactPath, outcome)
  routeReport.report = normaliseLighthouseResult(routeReport, outcome)
  return routeReport
}
