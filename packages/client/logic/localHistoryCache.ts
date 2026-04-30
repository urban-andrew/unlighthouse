import { $fetch } from 'ofetch'
import { shallowRef } from 'vue'
import { apiUrl, localHistoryEnabled } from './static'

/** Mirrors `/api/local-history` JSON used by Historical + category sparklines. */
export interface LocalHistoryRunRow {
  runId: string
  runAt: string
  siteAvg: number | null
  routeCount: number
  byType: Record<string, number | null>
  byCategory?: Record<string, number | null>
  byCategoryByType?: Record<string, Record<string, number | null>>
  annotation?: string | null
}

export interface LocalHistorySummaryPayload {
  enabled: boolean
  runs: LocalHistoryRunRow[]
  runsDaily?: LocalHistoryRunRow[]
  comparisons?: {
    consecutive: { siteAvgDeltaPct: number | null } | null
    dod: { siteAvgDeltaPct: number | null } | null
    wow: { siteAvgDeltaPct: number | null } | null
    mom: { siteAvgDeltaPct: number | null } | null
    yoy: { siteAvgDeltaPct: number | null } | null
  } | null
  wow?: { siteAvgDeltaPct: number | null } | null
}

const payload = shallowRef<LocalHistorySummaryPayload | null>(null)
const fetchError = shallowRef<string | null>(null)
let inflight: Promise<void> | null = null

/**
 * Single shared fetch for local history (Historical tab + category tab sparklines).
 */
export async function ensureLocalHistoryPayload(): Promise<void> {
  if (!localHistoryEnabled)
    return
  if (payload.value !== null)
    return
  if (inflight)
    return inflight
  inflight = (async () => {
    try {
      const res = await $fetch<LocalHistorySummaryPayload>(`${apiUrl}/local-history`)
      payload.value = res
      fetchError.value = null
    }
    catch (e) {
      fetchError.value = e instanceof Error ? e.message : 'Failed to load history'
    }
    finally {
      inflight = null
    }
  })()
  return inflight
}

export function getLocalHistoryPayload() {
  return payload
}

export function getLocalHistoryFetchError() {
  return fetchError
}
