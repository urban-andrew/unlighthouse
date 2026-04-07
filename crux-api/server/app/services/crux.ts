import type { H3Event } from 'h3'
import type { FetchError } from 'ofetch'
import { useRuntimeConfig } from '#imports'
import { $fetch } from 'ofetch'
import { withHttps, withTrailingSlash } from 'ufo'

/** Metrics requested from CrUX History API (p75 time series). */
const CRUX_HISTORY_METRICS = [
  'largest_contentful_paint',
  'cumulative_layout_shift',
  'interaction_to_next_paint',
  'first_contentful_paint',
  'first_input_delay',
  'experimental_time_to_first_byte',
] as const

type CruxHistoryMetricKey = (typeof CRUX_HISTORY_METRICS)[number]

export async function fetchCrux(event: H3Event, domain: string, formFactor: 'PHONE' | 'TABLET' | 'DESKTOP' = 'PHONE') {
  const apiKey = useRuntimeConfig(event).google.cruxApiToken
  if (!apiKey)
    throw new Error('Missing NITRO_GOOGLE_CRUX_API_TOKEN — configure a CrUX API key in runtime config.')

  const origin = withTrailingSlash(withHttps(domain))
  const results = await $fetch(`/records:queryHistoryRecord`, {
    baseURL: 'https://chromeuxreport.googleapis.com/v1',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    query: {
      key: apiKey,
    },
    body: {
      origin,
      formFactor,
      collectionPeriodCount: 40,
      metrics: [...CRUX_HISTORY_METRICS],
    },
  }).catch((e: FetchError) => {
    // 404 is okay, it just means there's no data for this domain
    if (e.status === 404)
      return { exists: false }
    if (e.status === 403)
      throw new Error(`CrUX API key is invalid or lacks permission for the CrUX History API.`)
    if (e.status === 429)
      throw new Error(`CrUX API rate limit exceeded — try again later.`)
    throw new Error(`CrUX API error (${e.status}): ${e.data?.error?.message || e.message}`)
  })

  if (!results || results.exists === false)
    return results

  const normalised = normaliseCruxHistory(results.record)
  // there was data but it was all empty?
  if (!normalised.dates.length)
    return { exists: false }
  return normalised
}
interface CrUXHistoryResult {
  key: {
    formFactor: 'PHONE' | 'DESKTOP' | 'TABLET'
    origin: string
  }
  metrics: Partial<Record<CruxHistoryMetricKey, {
    histogramTimeseries: Array<{
      start: number | string
      end?: number | string
      densities: number[]
    }>
    percentilesTimeseries: {
      p75s: (number | string | null)[]
    }
  }>>
  collectionPeriods: Array<{
    firstDate: {
      year: number
      month: number
      day: number
    }
    lastDate: {
      year: number
      month: number
      day: number
    }
  }>
}

interface NormalizedCrUXHistoryResult {
  dates: number[]
  cls?: { value: number, time: number }[]
  lcp?: { value: number, time: number }[]
  inp?: { value: number, time: number }[]
  fcp?: { value: number, time: number }[]
  fid?: { value: number, time: number }[]
  ttfb?: { value: number, time: number }[]
}

function normaliseCruxHistory(data: CrUXHistoryResult): NormalizedCrUXHistoryResult {
  // we need to turn it into a time series data where we have each metric seperated into
  // an array like { value: number, time: number }[]
  // we also need to make sure that the data is sorted by time
  const m = data.metrics
  const dates = data.collectionPeriods.map(period => new Date(period.firstDate.year, period.firstDate.month, period.firstDate.day).getTime())
  function normaliseP75(segment: number | string | null, i: number) {
    if (segment === null || segment === undefined || segment === 'NaN')
      return { value: 0, time: dates[i] }
    const value = Number.parseFloat(String(segment))
    return {
      value: Number.isFinite(value) ? value : 0,
      time: dates[i],
    }
  }
  const cls = (m?.cumulative_layout_shift?.percentilesTimeseries?.p75s || []).map(normaliseP75)
  const lcp = (m?.largest_contentful_paint?.percentilesTimeseries?.p75s || []).map(normaliseP75)
  const inp = (m?.interaction_to_next_paint?.percentilesTimeseries?.p75s || []).map(normaliseP75)
  const fcp = (m?.first_contentful_paint?.percentilesTimeseries?.p75s || []).map(normaliseP75)
  const fid = (m?.first_input_delay?.percentilesTimeseries?.p75s || []).map(normaliseP75)
  const ttfb = (m?.experimental_time_to_first_byte?.percentilesTimeseries?.p75s || []).map(normaliseP75)

  const series: Array<{ rows: { value: number, time: number }[], isCls: boolean }> = [
    { rows: cls, isCls: true },
    { rows: lcp, isCls: false },
    { rows: inp, isCls: false },
    { rows: fcp, isCls: false },
    { rows: fid, isCls: false },
    { rows: ttfb, isCls: false },
  ]

  function firstIdx(rows: { value: number }[], isCls: boolean) {
    if (!rows.length)
      return -1
    return isCls ? rows.findIndex(v => v.value >= 0) : rows.findIndex(v => v.value > 0)
  }
  function lastIdx(rows: { value: number }[], isCls: boolean) {
    if (!rows.length)
      return -1
    return isCls ? rows.findLastIndex(v => v.value >= 0) : rows.findLastIndex(v => v.value > 0)
  }

  const startIndexes = series.map(s => firstIdx(s.rows, s.isCls)).filter(i => i > -1)
  const lastIndexes = series.map(s => lastIdx(s.rows, s.isCls)).filter(i => i > -1)
  if (!startIndexes.length || !lastIndexes.length)
    return { dates: [] }

  const start = Math.min(...startIndexes)
  const end = Math.max(...lastIndexes) + 1

  function sliceOrUndefined(rows: { value: number, time: number }[], isCls: boolean) {
    const s = firstIdx(rows, isCls)
    if (s === -1)
      return undefined
    return rows.slice(start, end)
  }

  return {
    dates: dates.slice(start, end),
    cls: sliceOrUndefined(cls, true),
    lcp: sliceOrUndefined(lcp, false),
    inp: sliceOrUndefined(inp, false),
    fcp: sliceOrUndefined(fcp, false),
    fid: sliceOrUndefined(fid, false),
    ttfb: sliceOrUndefined(ttfb, false),
  }
}
