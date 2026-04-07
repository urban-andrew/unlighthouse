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
  wow: Wow | null
}

const TYPE_ORDER = [
  'homepage',
  'pages',
  'collections',
  'products',
  'cart',
  'checkout',
  'search',
  'blog',
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
  other: 'Other',
}

const payload = ref<Payload | null>(null)
const loadError = ref<string | null>(null)
const chartEl = ref<HTMLDivElement | null>(null)
let chart: ReturnType<typeof createChart> | null = null

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
    if (res.enabled && res.runs?.length)
      redrawChart(res.runs)
  }
  catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load history'
  }
}

watch(isDark, () => {
  if (payload.value?.enabled && payload.value.runs?.length)
    nextTick(() => redrawChart(payload.value!.runs))
})

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
        <div class="flex flex-wrap items-baseline gap-4">
          <div>
            <div class="text-xs uppercase opacity-60">
              Site average (latest run)
            </div>
            <div class="text-2xl font-semibold tabular-nums">
              {{ fmtScore(payload.runs[payload.runs.length - 1]?.siteAvg) }}
            </div>
          </div>
          <div v-if="payload.wow?.siteAvgDeltaPct != null" class="rounded-lg px-3 py-1 bg-teal-50 dark:bg-teal-900/30 border border-teal-200/60 dark:border-teal-800">
            <span class="text-xs uppercase opacity-70">WoW vs prior run</span>
            <span
              class="ml-2 font-medium tabular-nums"
              :class="payload.wow.siteAvgDeltaPct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'"
            >
              {{ fmtPct(payload.wow.siteAvgDeltaPct) }}
            </span>
          </div>
        </div>

        <div>
          <h3 class="font-semibold text-lg mb-2">
            Site average over time
          </h3>
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
                    v-if="payload.wow?.byType?.[t] != null"
                    class="ml-2 opacity-80"
                    :class="payload.wow.byType[t]! >= 0 ? 'text-green-600 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'"
                  >
                    ({{ fmtPct(payload.wow.byType[t]) }})
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
