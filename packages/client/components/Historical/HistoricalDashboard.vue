<script setup lang="ts">
import type { UTCTimestamp } from 'lightweight-charts'
import { createChart, LineSeries } from 'lightweight-charts'
import { $fetch } from 'ofetch'
import { isDark } from '../../logic/dark'
import { apiUrl } from '../../logic/static'

interface Wow {
  siteAvgDeltaPct: number | null
  byType: Record<string, number | null>
}

interface Run {
  runId: string
  runAt: string
  siteAvg: number | null
  routeCount: number
  byType: Record<string, number | null>
}

interface Payload {
  enabled: boolean
  runs: Run[]
  runsDaily?: Run[]
  comparisons?: {
    consecutive: Wow | null
    dod: Wow | null
    wow: Wow | null
    mom: Wow | null
    yoy: Wow | null
  } | null
  wow: Wow | null
}

const COMPARISON_OPTIONS = [
  { key: 'consecutive' as const, label: 'Prior run', hint: 'vs the scan before this one' },
  { key: 'dod' as const, label: 'DoD', hint: 'vs the latest scan on the previous UTC calendar day' },
  { key: 'wow' as const, label: 'WoW', hint: 'vs the newest scan at least ~7 days older' },
  { key: 'mom' as const, label: 'MoM', hint: 'vs the newest scan at least ~30 days older' },
  { key: 'yoy' as const, label: 'YoY', hint: 'vs the newest scan at least ~365 days older' },
]

const TYPE_ORDER = [
  'homepage',
  'pages',
  'collections',
  'products',
  'cart',
  'checkout',
  'search',
  'blog',
  'account',
  'rewards',
  'subscriptions',
  'other',
] as const

const TYPE_LABELS: Record<(typeof TYPE_ORDER)[number], string> = {
  homepage: 'Homepage',
  pages: 'Pages',
  collections: 'Collections',
  products: 'Products',
  cart: 'Cart',
  checkout: 'Checkout',
  search: 'Search results',
  blog: 'Blog',
  account: 'Account',
  rewards: 'Rewards',
  subscriptions: 'Subscriptions',
  other: 'Other',
}

const payload = ref<Payload | null>(null)
const loadError = ref<string | null>(null)
const chartEl = ref<HTMLDivElement | null>(null)
const comparisonMode = ref<(typeof COMPARISON_OPTIONS)[number]['key']>('consecutive')
/** When true, chart uses one point per UTC day (latest scan that day). */
const useDailySeries = ref(true)
let chart: ReturnType<typeof createChart> | null = null

const comparisonsResolved = computed(() => {
  const p = payload.value
  if (!p?.enabled)
    return null
  if (p.comparisons)
    return p.comparisons
  return {
    consecutive: p.wow,
    dod: null,
    wow: null,
    mom: null,
    yoy: null,
  }
})

const activeComparison = computed(() => {
  const c = comparisonsResolved.value
  if (!c)
    return null
  return c[comparisonMode.value] ?? null
})

const chartRuns = computed(() => {
  const p = payload.value
  if (!p?.enabled || !p.runs?.length)
    return []
  if (useDailySeries.value && p.runsDaily?.length)
    return p.runsDaily
  return p.runs
})

function chartLayout() {
  return {
    layout: {
      background: { color: isDark.value ? '#0f172a' : '#ffffff' },
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
    },
  }
}

function destroyChart() {
  chart?.remove()
  chart = null
}

function buildLineData(runs: Run[]) {
  const out: { time: UTCTimestamp, value: number }[] = []
  let lastTime = -1
  for (const r of runs) {
    if (r.siteAvg == null || Number.isNaN(r.siteAvg))
      continue
    let t = Math.floor(new Date(r.runAt).getTime() / 1000)
    if (t <= lastTime)
      t = lastTime + 1
    lastTime = t
    out.push({
      time: t as UTCTimestamp,
      value: Math.round(r.siteAvg * 10000) / 100,
    })
  }
  return out
}

function redrawChart(runs: Run[]) {
  destroyChart()
  const el = chartEl.value
  if (!el || runs.length === 0)
    return

  const data = buildLineData(runs)
  if (data.length === 0)
    return

  chart = createChart(el, {
    width: el.clientWidth,
    height: 280,
    ...chartLayout(),
  })
  const series = chart.addSeries(LineSeries, {
    color: '#0d9488',
    lineWidth: 2,
  })
  series.setData(data)
  chart.timeScale().fitContent()
}

async function load() {
  loadError.value = null
  try {
    const res = await $fetch<Payload>(`${apiUrl}/local-history`)
    payload.value = res
    await nextTick()
    if (res.enabled && chartRuns.value.length)
      redrawChart(chartRuns.value)
  }
  catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load history'
  }
}

watch([chartRuns, isDark, useDailySeries], () => {
  if (payload.value?.enabled && chartRuns.value.length)
    nextTick(() => redrawChart(chartRuns.value))
}, { deep: true })

onMounted(() => {
  load()
})

onUnmounted(() => {
  destroyChart()
})

function fmtPct(p: number | null | undefined) {
  if (p == null || Number.isNaN(p))
    return '—'
  const sign = p > 0 ? '+' : ''
  return `${sign}${p}%`
}

function fmtScore(s: number | null | undefined) {
  if (s == null || Number.isNaN(s))
    return '—'
  return `${Math.round(s * 100)}%`
}

function barWidth(score: number | null) {
  if (score == null || Number.isNaN(score))
    return '0%'
  return `${Math.min(100, Math.max(0, score * 100))}%`
}

function comparisonHint(key: (typeof COMPARISON_OPTIONS)[number]['key']) {
  return COMPARISON_OPTIONS.find(o => o.key === key)?.hint ?? ''
}
</script>

<template>
  <div class="w-full max-w-6xl space-y-8 pb-10">
    <div>
      <h2 class="font-bold text-2xl mb-2">
        Historical performance
      </h2>
      <p class="text-sm opacity-75 max-w-2xl">
        Averages from <code class="text-xs bg-gray-100 dark:bg-slate-800 px-1 rounded">localHistory</code> snapshots (each completed scan under
        <code class="text-xs bg-gray-100 dark:bg-slate-800 px-1 rounded">.unlighthouse/history/</code>). Page types use common URL patterns (e.g. Shopify-style paths).
      </p>
    </div>

    <div v-if="loadError" class="p-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-sm">
      {{ loadError }}
    </div>

    <template v-else-if="payload && !payload.enabled">
      <p class="text-sm opacity-80">
        Local history is disabled. Set <code class="text-xs bg-gray-100 dark:bg-slate-800 px-1 rounded">localHistory: { enabled: true }</code> in your Unlighthouse config and run a scan.
      </p>
    </template>

    <template v-else-if="payload?.enabled">
      <div
        v-if="payload.runs.length === 0"
        class="text-sm opacity-75"
      >
        No history runs yet. Complete a scan with local history enabled to see trends.
      </div>

      <template v-else>
        <div class="space-y-3">
          <div class="text-xs uppercase opacity-60">
            Compare change (latest run vs baseline)
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="opt in COMPARISON_OPTIONS"
              :key="opt.key"
              type="button"
              class="rounded-md px-3 py-1.5 text-sm font-medium border transition-colors"
              :class="comparisonMode === opt.key
                ? 'bg-teal-600 text-white border-teal-600 dark:bg-teal-700 dark:border-teal-700'
                : 'bg-white dark:bg-slate-900 border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-800'"
              :title="opt.hint"
              @click="comparisonMode = opt.key"
            >
              {{ opt.label }}
            </button>
          </div>
          <p class="text-xs opacity-70 max-w-2xl">
            {{ comparisonHint(comparisonMode) }}
          </p>
        </div>

        <div class="flex flex-wrap items-baseline gap-4">
          <div>
            <div class="text-xs uppercase opacity-60">
              Site average (latest run)
            </div>
            <div class="text-2xl font-semibold tabular-nums">
              {{ fmtScore(payload.runs[payload.runs.length - 1]?.siteAvg) }}
            </div>
          </div>
          <div
            v-if="activeComparison?.siteAvgDeltaPct != null"
            class="rounded-lg px-3 py-1 bg-teal-50 dark:bg-teal-900/30 border border-teal-200/60 dark:border-teal-800"
          >
            <span class="text-xs uppercase opacity-70">{{ COMPARISON_OPTIONS.find(o => o.key === comparisonMode)?.label }} Δ</span>
            <span
              class="ml-2 font-medium tabular-nums"
              :class="activeComparison.siteAvgDeltaPct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'"
            >
              {{ fmtPct(activeComparison.siteAvgDeltaPct) }}
            </span>
          </div>
          <div
            v-else
            class="rounded-lg px-3 py-1 text-xs opacity-70 border border-dashed border-gray-300 dark:border-slate-600"
          >
            No baseline for this comparison (need more history or older scans).
          </div>
        </div>

        <div>
          <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h3 class="font-semibold text-lg">
              Site average over time
            </h3>
            <div class="flex items-center gap-2 text-sm">
              <span class="text-xs opacity-70">Series</span>
              <button
                type="button"
                class="rounded px-2 py-0.5 text-xs border transition-colors"
                :class="useDailySeries
                  ? 'bg-teal-100 dark:bg-teal-900/40 border-teal-300 dark:border-teal-700'
                  : 'border-gray-300 dark:border-slate-600 opacity-80'"
                @click="useDailySeries = true"
              >
                Daily (UTC)
              </button>
              <button
                type="button"
                class="rounded px-2 py-0.5 text-xs border transition-colors"
                :class="!useDailySeries
                  ? 'bg-teal-100 dark:bg-teal-900/40 border-teal-300 dark:border-teal-700'
                  : 'border-gray-300 dark:border-slate-600 opacity-80'"
                @click="useDailySeries = false"
              >
                Every scan
              </button>
            </div>
          </div>
          <p class="text-xs opacity-65 mb-2 max-w-3xl">
            <template v-if="useDailySeries">
              One datapoint per UTC calendar day: if you run multiple scans the same day, only the last one that day is plotted.
            </template>
            <template v-else>
              One datapoint per completed scan (multiple runs on the same day appear as separate points).
            </template>
          </p>
          <div ref="chartEl" class="w-full h-[280px] rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden" />
        </div>

        <div>
          <h3 class="font-semibold text-lg mb-3">
            Breakdown by page type (latest run)
          </h3>
          <div class="space-y-3">
            <div
              v-for="t in TYPE_ORDER"
              :key="t"
              class="space-y-1"
            >
              <div class="flex justify-between text-xs gap-2">
                <span class="opacity-90">{{ TYPE_LABELS[t] }}</span>
                <span class="tabular-nums shrink-0">
                  {{ fmtScore(payload.runs[payload.runs.length - 1]?.byType?.[t]) }}
                  <span
                    v-if="activeComparison?.byType?.[t] != null"
                    class="ml-2 opacity-80"
                    :class="activeComparison.byType[t]! >= 0 ? 'text-green-600 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'"
                  >
                    ({{ fmtPct(activeComparison.byType[t]) }})
                  </span>
                </span>
              </div>
              <div class="h-2 rounded-full bg-gray-200/80 dark:bg-slate-700 overflow-hidden">
                <div
                  class="h-full rounded-full bg-teal-500/90 dark:bg-teal-600 transition-[width]"
                  :style="{ width: barWidth(payload.runs[payload.runs.length - 1]?.byType?.[t] ?? null) }"
                />
              </div>
            </div>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>
