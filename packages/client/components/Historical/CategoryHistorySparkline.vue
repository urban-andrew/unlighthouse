<script setup lang="ts">
import type { ISeriesApi, Time, UTCTimestamp } from 'lightweight-charts'
import { ColorType, LineSeries, TickMarkType, createChart, isBusinessDay } from 'lightweight-charts'
import { startCase } from 'lodash-es'
import { isDark } from '../../logic/dark'
import { ensureLocalHistoryPayload, getLocalHistoryFetchError, getLocalHistoryPayload } from '../../logic/localHistoryCache'

const props = defineProps<{
  /** Lighthouse category key, e.g. `performance`, `best-practices`. */
  categoryKey: string
}>()

const chartEl = ref<HTMLDivElement | null>(null)
let chart: ReturnType<typeof createChart> | null = null
let lineSeriesApi: ISeriesApi<'Line'> | null = null

const CHART_H = 120

function chartRunsForPlot() {
  const p = getLocalHistoryPayload().value
  if (!p?.enabled || !p.runs?.length)
    return []
  if (p.runsDaily?.length)
    return p.runsDaily
  return p.runs
}

function chartLayout() {
  return {
    layout: {
      background: {
        type: ColorType.Solid,
        color: isDark.value ? '#0f172a' : '#ffffff',
      },
      textColor: isDark.value ? '#e2e8f0' : '#1f2937',
    },
    grid: {
      vertLines: { color: isDark.value ? '#334155' : '#e5e7eb' },
      horzLines: { color: isDark.value ? '#334155' : '#e5e7eb' },
    },
    rightPriceScale: {
      borderColor: isDark.value ? '#475569' : '#d1d5db',
    },
    timeScale: {
      borderColor: isDark.value ? '#475569' : '#d1d5db',
      tickMarkFormatter: formatTimeTick,
    },
  }
}

function destroyChart() {
  chart?.remove()
  chart = null
  lineSeriesApi = null
}

function timeToDate(time: Time): Date | null {
  if (typeof time === 'number')
    return new Date(time * 1000)
  if (isBusinessDay(time))
    return new Date(Date.UTC(time.year, time.month - 1, time.day))
  return null
}

function formatChartTime(t: Time): string {
  const d = timeToDate(t)
  if (!d)
    return String(t)
  return d.toLocaleString(typeof navigator !== 'undefined' ? navigator.language : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function formatTimeTick(time: Time, tickMarkType: TickMarkType, locale: string): string | null {
  const d = timeToDate(time)
  if (!d)
    return null
  switch (tickMarkType) {
    case TickMarkType.Year:
      return d.toLocaleDateString(locale, { year: 'numeric' })
    case TickMarkType.Month:
      return d.toLocaleDateString(locale, { month: 'short', year: 'numeric' })
    case TickMarkType.DayOfMonth:
      return d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })
    case TickMarkType.Time:
    case TickMarkType.TimeWithSeconds:
      return d.toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    default:
      return d.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
  }
}

interface RunRow {
  runId: string
  runAt: string
  siteAvg: number | null
  routeCount: number
  byType: Record<string, number | null>
  byCategory?: Record<string, number | null>
}

function buildLineData(runs: RunRow[], categoryKey: string) {
  const data: { time: UTCTimestamp, value: number }[] = []
  const metaByTime = new Map<number, { runAt: string, runIndex: number, total: number }>()
  let lastTime = -1
  let plotted = 0
  const total = runs.filter(r => {
    const v = r.byCategory?.[categoryKey]
    return v != null && !Number.isNaN(v)
  }).length
  for (const r of runs) {
    const raw = r.byCategory?.[categoryKey]
    if (raw == null || Number.isNaN(raw))
      continue
    let t = Math.floor(new Date(r.runAt).getTime() / 1000)
    if (t <= lastTime)
      t = lastTime + 1
    lastTime = t
    plotted++
    data.push({
      time: t as UTCTimestamp,
      value: Math.round(raw * 10000) / 100,
    })
    metaByTime.set(t, { runAt: r.runAt, runIndex: plotted, total })
  }
  return { data, metaByTime }
}

const crosshairHint = ref('')

function redrawChart(runs: RunRow[], categoryKey: string) {
  destroyChart()
  crosshairHint.value = ''
  const el = chartEl.value
  if (!el || runs.length === 0)
    return

  const { data, metaByTime } = buildLineData(runs, categoryKey)
  if (data.length === 0)
    return

  chart = createChart(el, {
    height: CHART_H,
    autoSize: true,
    localization: {
      locale: typeof navigator !== 'undefined' ? navigator.language : 'en-US',
      timeFormatter: (t: Time) => formatChartTime(t),
    },
    ...chartLayout(),
  })
  const series = chart.addSeries(LineSeries, {
    color: '#0d9488',
    lineWidth: 2,
    autoscaleInfoProvider: () => ({
      priceRange: { minValue: 0, maxValue: 100 },
    }),
    priceFormat: {
      type: 'custom',
      minMove: 0.25,
      formatter: (priceValue: number) => `${Math.round(priceValue)}%`,
    },
    pointMarkersVisible: true,
    pointMarkersRadius: 2,
    lastValueVisible: true,
  })
  lineSeriesApi = series
  series.setData(data)
  chart.timeScale().fitContent()

  chart.subscribeCrosshairMove((param) => {
    if (param.point === undefined || param.time === undefined || !lineSeriesApi) {
      crosshairHint.value = ''
      return
    }
    const t = typeof param.time === 'number' ? param.time : null
    if (t == null) {
      crosshairHint.value = ''
      return
    }
    const meta = metaByTime.get(t)
    if (!meta) {
      crosshairHint.value = ''
      return
    }
    const row = param.seriesData.get(lineSeriesApi) as { value?: number } | undefined
    const score = row?.value != null && !Number.isNaN(row.value) ? `${Math.round(row.value)}%` : '—'
    crosshairHint.value = `Run ${meta.runIndex}/${meta.total} · ${formatChartTime(t as Time)} · ${score}`
  })
}

function scheduleDraw() {
  void nextTick(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const runs = chartRunsForPlot()
        redrawChart(runs, props.categoryKey)
      })
    })
  })
}

const sharedPayload = getLocalHistoryPayload()

watch([() => props.categoryKey, isDark, sharedPayload], () => {
  const p = sharedPayload.value
  if (!p?.enabled || !chartRunsForPlot().length)
    return destroyChart()
  scheduleDraw()
}, { deep: true })

onMounted(async () => {
  await ensureLocalHistoryPayload()
  const p = getLocalHistoryPayload().value
  if (p?.enabled && chartRunsForPlot().length)
    scheduleDraw()
})

onUnmounted(() => {
  destroyChart()
})

const sectionTitle = computed(() => `${startCase(props.categoryKey)} · local history`)
const showDisabled = computed(() => {
  const p = sharedPayload.value
  return p && !p.enabled
})
const showNoPoints = computed(() => {
  const p = sharedPayload.value
  if (!p?.enabled)
    return false
  const runs = chartRunsForPlot()
  if (!runs.length)
    return true
  return !runs.some(r => r.byCategory?.[props.categoryKey] != null && !Number.isNaN(r.byCategory![props.categoryKey]!))
})
const fetchErr = computed(() => getLocalHistoryFetchError().value)
</script>

<template>
  <div v-if="fetchErr" class="mb-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs">
    {{ fetchErr }}
  </div>
  <div v-else-if="showDisabled" class="mb-3 text-xs opacity-70">
    Enable <code class="rounded bg-gray-100 px-1 dark:bg-slate-800">localHistory</code> to see category trends here.
  </div>
  <div v-else-if="showNoPoints" class="mb-3 text-xs opacity-70">
    No saved snapshots yet, or no scores for {{ startCase(categoryKey) }} in history. Complete a scan with local history on.
  </div>
  <div v-else class="mb-4 w-full max-w-5xl space-y-1">
    <div class="text-xs font-medium uppercase tracking-wide opacity-70">
      {{ sectionTitle }}
    </div>
    <p class="text-[11px] opacity-65 leading-snug">
      Mean {{ startCase(categoryKey) }} score across all routes in each snapshot (daily UTC when multiple runs share a day).
    </p>
    <div class="relative min-h-[120px] min-w-0 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
      <div ref="chartEl" class="h-[120px] w-full min-w-0" />
      <div
        v-if="crosshairHint"
        class="pointer-events-none absolute bottom-0.5 left-0.5 right-0.5 z-10 truncate rounded bg-white/90 px-1.5 py-0.5 text-center text-[10px] text-gray-800 shadow-sm dark:bg-slate-900/90 dark:text-slate-100"
      >
        {{ crosshairHint }}
      </div>
    </div>
  </div>
</template>
