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
  <btn-action v-if="screenshots.length > 0" title="Open page load timeline" class="w-full" @click="openModal">
    <div class="w-full flex justify-between">
      <img v-for="(image, key) in screenshots" :key="`${viewFormFactor}-${String(key)}`" loading="lazy" :src="image.data" height="120" class="max-w-[10%] max-h-[120px] h-auto w-[10%]" alt="">
    </div>
  </btn-action>
</template>
