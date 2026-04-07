import type { NormalisedRoute, ScanMeta, UnlighthouseRouteReport } from '@unlighthouse/core'
import { cloneDeep, sum } from 'lodash-es'
import { joinURL } from 'ufo'
import { computed, reactive, ref, watch } from 'vue'
import CellRouteName from '../components/Cell/CellRouteName.vue'
import CellScoreSingle from '../components/Cell/CellScoreSingle.vue'
import CellScoresOverview from '../components/Cell/CellScoresOverview.vue'
import { useFetch } from './fetch'
import { sorting } from './search'
import { basePath, categories, columns, device, dualDevice, isStatic, wsUrl } from './static'

/** Must match `ReportArtifacts.screenshotThumbnailsDir` in core (avoid importing @unlighthouse/core in client bundle). */
const SCREENSHOT_THUMBNAILS_DIR = '__screenshot-thumbnails__'

export const activeTab = ref(0)

export const isDebugModalOpen = ref<boolean>(false)
export const lighthouseReportModalOpen = ref<boolean>(false)
export const contentModalOpen = ref<boolean>(false)
export const iframeModalUrl = ref<string | null>()
export const thumbnailsModalOpen = ref<boolean>(false)
export const activeScreenshots = ref<any[]>([])

// Legacy support - computed that returns true if any modal is open
export const isModalOpen = computed(() =>
  isDebugModalOpen.value || lighthouseReportModalOpen.value || contentModalOpen.value || thumbnailsModalOpen.value,
)

export function closeIframeModal() {
  lighthouseReportModalOpen.value = false
  iframeModalUrl.value = ''
}

export function closeAllModals() {
  isDebugModalOpen.value = false
  lighthouseReportModalOpen.value = false
  contentModalOpen.value = false
  thumbnailsModalOpen.value = false
  iframeModalUrl.value = ''
  activeScreenshots.value = []
}

export function openDebugModal() {
  isDebugModalOpen.value = true
}

export function openLighthouseReportIframeModal(report: UnlighthouseRouteReport, tab?: string) {
  const path = resolveArtifactPath(report, '/lighthouse.html')
  iframeModalUrl.value = `${path}${tab ? `#${tab}` : ''}`
  lighthouseReportModalOpen.value = true
}

export function openContentModal() {
  contentModalOpen.value = true
}

export function openThumbnailsModal(screenshots: any[]) {
  activeScreenshots.value = screenshots
  thumbnailsModalOpen.value = true
}

export function closeThumbnailsModal() {
  thumbnailsModalOpen.value = false
  activeScreenshots.value = []
}

export function changedTab(index: number) {
  activeTab.value = index
  sorting.value = {}
}

export const resultColumns = computed(() => {
  return [
    {
      label: '',
      slot: 'select',
      cols: 1,
      classes: ['justify-center', 'self-start', 'pt-1'],
    },
    {
      label: 'Page',
      slot: 'routeName',
      key: 'route.path',
      sortable: true,
      component: CellRouteName,
      cols: 4,
    },
    {
      label: 'Score',
      key: activeTab.value === 0 ? 'report.score' : `report.categories.${categories[activeTab.value - 1]}.score`,
      sortable: true,
      cols: activeTab.value === 0
        ? (categories.includes('performance') ? 3 : 5)
        : 1,
      component: activeTab.value === 0
        ? CellScoresOverview
        : CellScoreSingle,
    },
    ...(activeTab.value > columns.length - 1 ? [] : columns[activeTab.value])
      .filter((c) => {
        // remove screenshot timeline if performance is not present
        if (c.key === 'report.audits.screenshot-thumbnails' && !categories.includes('performance')) {
          return false
        }
        return true
      }),
    {
      label: 'Actions',
      cols: 1,
      slot: 'actions',
      classes: ['justify-center'],
    },
  ]
})

export const wsReports: Map<string, UnlighthouseRouteReport> = reactive(new Map<string, UnlighthouseRouteReport>())

const primaryFormFactor: 'mobile' | 'desktop' = !device || device === 'mobile' ? 'mobile' : 'desktop'
export const viewFormFactor = ref<'mobile' | 'desktop'>(primaryFormFactor)
/** Bumps when toggling mobile/desktop so static payloads re-render. */
export const dualViewTick = ref(0)

export function resolveArtifactPath(report: UnlighthouseRouteReport, file: string) {
  if (!report?.artifactUrl) {
    return ''
  }
  void dualViewTick.value
  const withoutBase = report.artifactUrl.replace(basePath, '')
  const deviceSeg = dualDevice ? `${viewFormFactor.value}/` : ''
  if (isStatic) {
    let cleanPathname = window.location.pathname
    cleanPathname = cleanPathname.replace(/\/index\.html$/, '')
    return joinURL(cleanPathname, withoutBase, deviceSeg, file)
  }
  return joinURL(window.location.pathname, withoutBase, deviceSeg, file)
}

/**
 * Filmstrip thumbnails: paths must follow the active form factor so desktop view does not show mobile frames.
 */
export function resolveScreenshotThumbnailUrl(report: UnlighthouseRouteReport, frameKey: string) {
  void dualViewTick.value
  return resolveArtifactPath(report, `/${SCREENSHOT_THUMBNAILS_DIR}/${frameKey}.jpeg`)
}

function applyReportViewForFormFactor(report: UnlighthouseRouteReport) {
  if (!dualDevice || !report.reportByFormFactor)
    return
  const next = report.reportByFormFactor[viewFormFactor.value]
  if (next)
    report.report = cloneDeep(next)
}

watch(
  viewFormFactor,
  () => {
    dualViewTick.value++
    if (!dualDevice)
      return
    for (const r of wsReports.values())
      applyReportViewForFormFactor(r)
    if (isStatic) {
      for (const r of window.__unlighthouse_payload?.reports || [])
        applyReportViewForFormFactor(r)
    }
  },
  { immediate: true },
)

export const unlighthouseReports = computed<UnlighthouseRouteReport[]>(() => {
  void dualViewTick.value
  if (isStatic) {
    const r = window.__unlighthouse_payload?.reports || []
    return [...r]
  }
  return Array.from(wsReports.values())
})

export const fetchedScanMeta = isStatic
  ? null
  : reactive(
      useFetch('/scan-meta')
        .get()
        .json<ScanMeta>(),
    )

export const lastScanMeta = ref<ScanMeta | null>(null)

/**
 * Has the users session gone from online to offline
 */
export const isOffline = computed<boolean>(() => {
  if (isStatic)
    return false // Static builds are not "offline", they just don't have dynamic data

  return !!(!fetchedScanMeta?.data && lastScanMeta.value)
})

/**
 * Check if we should show the waiting/offline state
 */
export const shouldShowWaitingState = computed<boolean>(() => {
  if (isStatic) {
    // For static builds, show waiting state only if there's no report data
    return !window.__unlighthouse_payload?.reports?.length
  }

  // For dynamic mode, show waiting state if:
  // 1. We have no reports at all, OR
  // 2. We've lost connection to the server
  return wsReports.size === 0 || isOffline.value
})

export const rescanRoute = (route: NormalisedRoute) => useFetch(`/reports/${route.id}/rescan`).post()

export const scanMeta = computed<ScanMeta | null>(() => {
  if (isStatic)
    return window.__unlighthouse_payload?.scanMeta

  if (fetchedScanMeta?.data)
    return fetchedScanMeta?.data

  // scan meta is null, check the last meta to avoid corrupting the UI
  if (lastScanMeta.value)
    return lastScanMeta.value

  return null
})

export function refreshScanMeta() {
  if (!fetchedScanMeta)
    return

  const res = fetchedScanMeta.execute()
  if (fetchedScanMeta?.data)
    lastScanMeta.value = fetchedScanMeta?.data

  return res
}

export async function wsConnect() {
  try {
    const ws = new WebSocket(wsUrl)
    ws.onmessage = (message) => {
      try {
        const { response } = JSON.parse(message.data)
        if (response?.route?.path) {
          wsReports.set(response.route.path, response)
          applyReportViewForFormFactor(response)
        }
      }
      catch (error) {
        console.warn('Failed to parse WebSocket message:', error)
      }
    }
    ws.onerror = (error) => {
      console.warn('WebSocket connection error:', error)
    }
    ws.onclose = () => {
      console.warn('WebSocket connection closed')
    }

    try {
      const reports = await useFetch('/reports').get().json<UnlighthouseRouteReport[]>()
      if (reports.data.value && Array.isArray(reports.data.value)) {
        reports.data.value.forEach((report) => {
          if (report?.route?.path) {
            wsReports.set(report.route.path, report)
            applyReportViewForFormFactor(report)
          }
        })
      }
    }
    catch (fetchError) {
      console.warn('Failed to fetch initial reports:', fetchError)
      // Still continue - WebSocket might work even if initial fetch fails
    }
  }
  catch (error) {
    console.warn('Failed to connect to Unlighthouse server:', error)
    throw error // Re-throw to let caller handle it
  }
}

export const categoryScores = computed(() => {
  const reports = unlighthouseReports.value || []
  const reportsFinished = reports.filter(r => !!r.report)

  if (reportsFinished.length === 0) {
    return categories.map(() => 0)
  }

  return categories.map((c, i) => {
    const reportsWithGoodScore = reportsFinished
    // make sure the score is valid, if it's ? we don't want to count it
      .filter(r => !!r.report?.categories?.[i]?.score)

    if (reportsWithGoodScore.length === 0) {
      return 0
    }

    return sum(
      reportsWithGoodScore
      // make sure the score is valid, if it's ? we don't want to count it
        .map(r => r.report?.categories?.[i]?.score || 0),
    ) / reportsWithGoodScore.length
  })
})
