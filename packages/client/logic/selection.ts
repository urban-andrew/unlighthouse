import type { UnlighthouseRouteReport } from '@unlighthouse/core'
import { get } from 'lodash-es'
import { $fetch } from 'ofetch'
import { computed, shallowRef } from 'vue'
import { paginatedResults, searchResults } from './search'
import { apiUrl, groupRoutesKey } from './static'

const selectedIds = shallowRef(new Set<string>())

function setSelection(next: Set<string>) {
  selectedIds.value = next
}

export function isRouteSelected(routeId: string): boolean {
  return selectedIds.value.has(routeId)
}

export const selectedCount = computed(() => selectedIds.value.size)

export function toggleRouteSelection(report: UnlighthouseRouteReport) {
  const id = report.route.id
  const n = new Set(selectedIds.value)
  if (n.has(id))
    n.delete(id)
  else
    n.add(id)
  setSelection(n)
}

export function selectAllFiltered() {
  const n = new Set<string>()
  for (const r of searchResults.value)
    n.add(r.route.id)
  setSelection(n)
}

export function selectNone() {
  setSelection(new Set())
}

export function toggleSelectCurrentPage() {
  const pageIds = paginatedResults.value.map(r => r.route.id)
  const allOnPage = pageIds.length > 0 && pageIds.every(id => selectedIds.value.has(id))
  const n = new Set(selectedIds.value)
  if (allOnPage) {
    for (const id of pageIds)
      n.delete(id)
  }
  else {
    for (const id of pageIds)
      n.add(id)
  }
  setSelection(n)
}

export function selectSameGroupAs(report: UnlighthouseRouteReport) {
  const keyVal = get(report, groupRoutesKey)
  const n = new Set(selectedIds.value)
  for (const r of searchResults.value) {
    if (get(r, groupRoutesKey) === keyVal)
      n.add(r.route.id)
  }
  setSelection(n)
}

export const pageSelectionState = computed(() => {
  const ids = paginatedResults.value.map(r => r.route.id)
  if (ids.length === 0)
    return { checked: false, indeterminate: false }
  const sel = selectedIds.value
  const count = ids.filter(id => sel.has(id)).length
  return {
    checked: count === ids.length,
    indeterminate: count > 0 && count < ids.length,
  }
})

export async function rescanSelectedRoutes(): Promise<void> {
  const ids = [...selectedIds.value]
  for (const id of ids) {
    await $fetch(`${apiUrl}/reports/${id}/rescan`, { method: 'POST' })
  }
}
