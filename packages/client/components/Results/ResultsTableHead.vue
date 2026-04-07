<script lang="ts" setup>
import type { UnlighthouseColumn } from '@unlighthouse/core'
import { ref, watchEffect } from 'vue'
import {
  isOffline,
  isStatic,
  pageSelectionState,
  rescanSelectedRoutes,
  selectAllFiltered,
  selectedCount,
  selectNone,
  toggleSelectCurrentPage,
} from '../../logic'

defineProps<{
  sorting: Record<string, 'desc' | 'asc' | undefined>
  column: UnlighthouseColumn & { slot?: string }
}>()

defineEmits<{
  (e: 'sort', key: string): void
}>()

function htmlTooltip(s: string) {
  // we need to convert links into html for example
  // [Learn more](https://web.dev/lighthouse-largest-contentful-paint/) -> <a href="https://web.dev/lighthouse-largest-contentful-paint/">Learn more</a>
  return s
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a class="underline" target="_blank" href="$2">$1</a>')
    .replace(/\n/g, '<br>')
}

const selectionBusy = ref(false)
const pageSelectCheckbox = ref<HTMLInputElement | null>(null)

watchEffect(() => {
  const p = pageSelectionState.value
  const el = pageSelectCheckbox.value
  if (el) {
    el.indeterminate = p.indeterminate
    el.checked = p.checked
  }
})

async function onRescanSelected() {
  if (isStatic || isOffline.value || selectedCount.value === 0)
    return
  selectionBusy.value = true
  try {
    await rescanSelectedRoutes()
  }
  finally {
    selectionBusy.value = false
  }
}
</script>

<template>
  <div
    :class="[`col-span-${column.cols || '2'}`, ...(column.classes ? column.classes : [])]"
    class="flex flex-col"
  >
    <template v-if="column.slot === 'select'">
      <span class="sr-only">Select routes to rescan</span>
      <div class="flex flex-col gap-1.5 items-center">
        <input
          ref="pageSelectCheckbox"
          type="checkbox"
          class="rounded border-gray-400 dark:border-gray-500 cursor-pointer"
          :disabled="isStatic || isOffline"
          title="Select or clear all routes on this page"
          @change="toggleSelectCurrentPage()"
        >
        <div class="flex flex-col gap-0.5 text-[10px] leading-tight text-center">
          <btn-action
            class="px-1 py-0.5 rounded"
            :disabled="isStatic || isOffline ? 'disabled' : false"
            @click="selectAllFiltered()"
          >
            Select All
          </btn-action>
          <btn-action
            class="px-1 py-0.5 rounded"
            :disabled="isStatic || isOffline ? 'disabled' : false"
            @click="selectNone()"
          >
            None
          </btn-action>
        </div>
        <btn-action
          class="text-sm font-medium px-3 py-2 rounded-md whitespace-nowrap min-w-[7.5rem]"
          :disabled="isStatic || isOffline || selectedCount === 0 || selectionBusy ? 'disabled' : false"
          :title="`Rescan ${selectedCount} selected`"
          @click="onRescanSelected()"
        >
          Rescan ({{ selectedCount }})
        </btn-action>
      </div>
    </template>
    <template v-else>
      <div class="flex items-center ">
        <tooltip v-if="column.tooltip">
          <span class="whitespace-nowrap flex items-center">{{ column.label }}
            <UIcon v-if="column?.warning" name="i-carbon-warning-alt" class="text-yellow-500 ml-1 text-xs opacity-75" />
            <UIcon v-else name="i-carbon-information" class="ml-1 text-xs opacity-75" />
          </span>
          <template #tooltip>
            <div v-html="htmlTooltip(column.tooltip)" />
          </template>
        </tooltip>
        <div v-else>
          <span class="whitespace-nowrap">{{ column.label }}</span>
        </div>
        <button
          v-if="(column.sortable || !!column.sortKey) && column.key"
          class="ml-2 p-0.3 dark:border-none dark:bg-blue-900/20 border-2 border-blue-100 ring-blue-200 hover:ring-1 rounded-lg"
          :class="sorting.key === column.key && sorting.dir ? ['dark:bg-blue-900/70', 'bg-blue-900', 'text-blue-200'] : []"
          @click="$emit('sort', column.key)"
        >
          <UIcon v-if="sorting.key !== column.key || !sorting.dir" name="i-carbon-chevron-sort" />
          <UIcon v-else-if="sorting.key === column.key && sorting.dir === 'desc'" name="i-carbon-chevron-sort-down" />
          <UIcon v-else-if="sorting.key === column.key && sorting.dir === 'asc'" name="i-carbon-chevron-sort-up" />
        </button>
      </div>
      <slot :name="column.slot || column.label" />
    </template>
  </div>
</template>
