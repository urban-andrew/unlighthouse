<script setup lang="ts">
import { cruxFieldRegression, labCategoryWeekOverWeek, latestCruxValue, passesCruxBudget } from '../../logic/cwvMonitoring'
import { useHumanMs } from '../../logic/formatting'
import { cwvMonitoring, dualDevice, website } from '../../logic/static'
import { ensureLocalHistoryPayload, getLocalHistoryPayload } from '../../logic/localHistoryCache'
import { HISTORY_PAGE_TYPE_LABELS, HISTORY_PAGE_TYPE_ORDER } from '../../constants/pageTypeOrder'

const props = defineProps<{
  cruxMobile: Record<string, unknown> | null
  cruxDesktop: Record<string, unknown> | null
}>()

const payloadReady = ref(false)

onMounted(async () => {
  await ensureLocalHistoryPayload()
  payloadReady.value = true
})

const budgets = computed(() => cwvMonitoring.cruxBudgets)
const absTh = computed(() => cwvMonitoring.cruxRegressionAbs)

function series(form: 'mobile' | 'desktop', key: 'lcp' | 'inp' | 'cls') {
  const crux = form === 'mobile' ? props.cruxMobile : props.cruxDesktop
  const raw = crux?.[key]
  return Array.isArray(raw) ? raw as { time: string, value: number }[] : undefined
}

function cruxRow(form: 'mobile' | 'desktop', metric: 'lcp' | 'inp' | 'cls') {
  const s = series(form, metric)
  const v = latestCruxValue(s)
  const pass = passesCruxBudget(v, metric, budgets.value)
  const reg = cruxFieldRegression(s, metric, 7, absTh.value)
  return { value: v, pass, reg, label: metric.toUpperCase() }
}

const psiUrl = computed(() => `https://pagespeed.web.dev/report?url=${encodeURIComponent(website)}`)

const labWow = computed(() => {
  const p = getLocalHistoryPayload().value
  const v = p?.comparisons?.wow?.siteAvgDeltaPct ?? p?.wow?.siteAvgDeltaPct
  if (v == null || Number.isNaN(v))
    return null
  return v
})

const labPerfWorse = computed(() => {
  const p = getLocalHistoryPayload().value
  return labCategoryWeekOverWeek(p?.runs, 'performance', 6, cwvMonitoring.siteScoreRegressionDeltaPct)
})

const perfByTypeLatest = computed(() => {
  const p = getLocalHistoryPayload().value
  if (!p?.enabled || !p.runs?.length)
    return []
  const last = p.runs[p.runs.length - 1]
  const row = last?.byCategoryByType?.performance
  if (!row)
    return []
  return HISTORY_PAGE_TYPE_ORDER.map((t) => {
    const v = row[t]
    return { type: t, label: HISTORY_PAGE_TYPE_LABELS[t], score: v }
  }).filter(x => x.score != null && !Number.isNaN(x.score))
})

function fmtPct01(x: number) {
  return `${Math.round(x * 100)}%`
}

function fmtCls(x: number) {
  return x.toFixed(3)
}
</script>

<template>
  <div
    v-if="payloadReady"
    class="mb-4 w-full max-w-6xl space-y-3 rounded-lg border border-teal-200/60 bg-teal-50/40 p-3 dark:border-teal-900/50 dark:bg-teal-950/30"
  >
    <p class="text-xs leading-relaxed opacity-90">
      <strong class="font-semibold">Field vs lab:</strong>
      CrUX below = real users (p75). Lighthouse scores in the table = synthetic runs (throttled, single navigation).
      Prefer CrUX for regressions; use Lighthouse to find causes.
    </p>

    <div class="flex flex-wrap gap-2">
      <span
        v-if="labWow != null && labWow <= cwvMonitoring.siteScoreRegressionDeltaPct"
        class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
      >
        Lab site avg WoW {{ labWow }}% (≤ {{ cwvMonitoring.siteScoreRegressionDeltaPct }}%)
      </span>
      <span
        v-if="labPerfWorse.worsened && labPerfWorse.deltaPct != null"
        class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
      >
        Lab Performance (mean) vs ~7d: {{ labPerfWorse.deltaPct }}%
      </span>
      <template v-for="form in (dualDevice ? (['mobile', 'desktop'] as const) : (['mobile'] as const))" :key="form">
        <template v-for="metric in (['lcp', 'inp', 'cls'] as const)" :key="`${form}-${metric}`">
          <span
            v-if="cruxRow(form, metric).reg.worsened && cruxRow(form, metric).reg.delta != null"
            class="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-900 dark:bg-red-900/35 dark:text-red-100"
          >
            CrUX {{ form === 'mobile' ? 'Mobile' : 'Desktop' }} {{ metric.toUpperCase() }}
            +{{ metric === 'cls' ? cruxRow(form, metric).reg.delta!.toFixed(3) : useHumanMs(Math.round(cruxRow(form, metric).reg.delta!)) }} vs ~7d
          </span>
        </template>
      </template>
    </div>

    <div class="grid gap-3 md:grid-cols-2">
      <div
        v-for="form in (dualDevice ? (['mobile', 'desktop'] as const) : (['mobile'] as const))"
        :key="form"
        class="rounded-md border border-gray-200/80 bg-white/80 p-2 text-xs dark:border-slate-600 dark:bg-slate-900/50"
      >
        <div class="mb-1 font-semibold uppercase tracking-wide opacity-70">
          CrUX origin · {{ form === 'mobile' ? 'Phone' : 'Desktop' }}
        </div>
        <div class="grid grid-cols-3 gap-1">
          <div v-for="metric in (['lcp', 'inp', 'cls'] as const)" :key="metric" class="tabular-nums">
            <div class="opacity-60">
              {{ metric.toUpperCase() }}
            </div>
            <div v-if="cruxRow(form, metric).value == null" class="text-gray-500">
              —
            </div>
            <div v-else class="font-medium">
              {{ metric === 'cls' ? fmtCls(cruxRow(form, metric).value!) : useHumanMs(Math.round(cruxRow(form, metric).value!)) }}
              <span
                v-if="cruxRow(form, metric).pass === true"
                class="ml-0.5 text-green-600 dark:text-green-400"
              >✓</span>
              <span
                v-else-if="cruxRow(form, metric).pass === false"
                class="ml-0.5 text-amber-700 dark:text-amber-400"
              >✗</span>
            </div>
            <div class="text-[10px] opacity-60">
              ≤{{ metric === 'cls' ? budgets.cls : useHumanMs(metric === 'inp' ? budgets.inpMs : budgets.lcpMs) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="perfByTypeLatest.length" class="rounded-md border border-gray-200/80 bg-white/60 p-2 text-xs dark:border-slate-600 dark:bg-slate-900/40">
      <div class="mb-1 font-semibold uppercase tracking-wide opacity-70">
        Lab Performance (mean) by page type — latest snapshot
      </div>
      <div class="flex flex-wrap gap-x-3 gap-y-1">
        <span v-for="row in perfByTypeLatest" :key="row.type" class="tabular-nums">
          <span class="opacity-75">{{ row.label }}:</span>
          {{ fmtPct01(row.score!) }}
        </span>
      </div>
    </div>

    <div class="flex flex-wrap gap-x-4 gap-y-1 text-[11px] opacity-85">
      <a :href="cwvMonitoring.rumDocsUrl" class="underline hover:no-underline" target="_blank" rel="noopener">Web Vitals (RUM overview)</a>
      <a :href="cwvMonitoring.rumSnippetUrl" class="underline hover:no-underline" target="_blank" rel="noopener">web-vitals on GitHub</a>
      <a :href="cwvMonitoring.schedulingDocsUrl" class="underline hover:no-underline" target="_blank" rel="noopener">Unlighthouse docs</a>
      <a :href="psiUrl" class="underline hover:no-underline" target="_blank" rel="noopener">PageSpeed Insights (this site)</a>
    </div>
  </div>
</template>
