<script lang="ts" setup>
import type { UnlighthouseColumn, UnlighthouseRouteReport } from '@unlighthouse/core'
import { dualDevice, dualViewTick, openThumbnailsModal, resolveScreenshotThumbnailUrl, viewFormFactor } from '../../logic'

const props = defineProps<{
  report: UnlighthouseRouteReport
  column: UnlighthouseColumn
  value: any
}>()

const screenshots = computed(() => {
  void dualViewTick.value
  void viewFormFactor.value
  const raw = props.value?.details?.items
  if (!raw)
    return [] as { data: string }[]
  const mapFrame = (item: any, key: string) => ({
    ...item,
    data: dualDevice ? resolveScreenshotThumbnailUrl(props.report, key) : item.data,
  })
  if (Array.isArray(raw))
    return raw.map((item, i) => mapFrame(item, String(i)))
  return Object.keys(raw).map(k => mapFrame(raw[k], k))
})

function openModal() {
  openThumbnailsModal(screenshots.value)
}
</script>

<template>
  <btn-action v-if="screenshots.length > 0" title="Open page load timeline" class="w-full py-0.5" @click="openModal">
    <div class="w-full flex justify-between gap-0.5 items-center min-h-0">
      <img
        v-for="(image, key) in screenshots"
        :key="`${viewFormFactor}-${String(key)}`"
        loading="lazy"
        :src="image.data"
        class="max-h-[56px] w-[10%] min-w-0 h-auto object-contain shrink"
        alt=""
      >
    </div>
  </btn-action>
</template>
