<script setup lang="ts">
import { formatDistance } from 'date-fns'
import { basePath, dualDevice, isDark, isOffline, isRescanSiteRequestRunning, isStatic, rescanSite, scanMeta, toggleDark, viewFormFactor, website } from '../logic'

const timeRemaining = computed(() => {
  return formatDistance(0, scanMeta.value.monitor.timeRemaining, { includeSeconds: true })
})

const version = __UNLIGHTHOUSE_VERSION__

const favIcon = computed(() => {
  if (!scanMeta.value?.favicon)
    return '/favicon.ico'
  else if (scanMeta.value?.favicon?.startsWith('http'))
    return scanMeta.value?.favicon

  return website + (scanMeta.value?.favicon)
})
</script>

<template>
  <nav class="bg-white dark:bg-transparent font-light border-b border-main flex items-center gap-6 md:gap-8 xl:gap-10 children:my-auto px-4 md:px-8 py-3">
    <a class="text-md font-medium text-teal-700 dark:text-teal-200 font-mono items-center hidden md:flex cursor-pointer shrink-0" href="https://unlighthouse.dev" target="_blank">
      <img :src="basePath && basePath !== '/' ? `${basePath}assets/logo-light.svg` : 'assets/logo-light.svg'" height="24" width="24" class="w-[24px] h-[24px] mr-2 hidden dark:block" alt="Unlighthouse logo">
      <img :src="basePath && basePath !== '/' ? `${basePath}assets/logo-dark.svg` : 'assets/logo-dark.svg'" height="24" width="24" class="w-[24px] h-[24px] mr-2 block dark:hidden" alt="Unlighthouse logo">
      <div class="flex flex-col">
        <span>Unlighthouse</span>
        <span class="text-xs text-gray-500 dark:text-gray-400 font-normal">v{{ version }}</span>
      </div>
    </a>
    <div class="flex w-full min-w-0 justify-between items-center text-xs md:ml-2 md:mr-6 lg:mr-10 gap-4">
      <div class="flex flex-wrap items-center gap-x-5 gap-y-2 md:gap-x-7 lg:gap-x-9">
        <div v-if="website && !website.includes('localhost')" class="hidden xl:block">
          <stat-item
            label="Website"
            size="sm"
          >
            <template #value>
              <img alt="" :src="favIcon" width="16" height="16" class="mr-1 inline-block">
              <span>{{ website.replace('https://', '').replace('http://', '').replace('www.', '') }}</span>
            </template>
          </stat-item>
        </div>
        <div v-if="isOffline" class="hidden md:block">
          <warning-chip>
            {{ isStatic ? 'Static' : 'Offline' }} Mode
          </warning-chip>
        </div>
        <div v-if="scanMeta" class="hidden md:block">
          <div class="uppercase opacity-55">
            Total Score
          </div>
          <div class="flex items-center">
            <metric-guage v-if="scanMeta?.score" :score="scanMeta.score" :stripped="true" class="font-medium text-sm" />
            <loading-spinner v-else class="h-[24px]" />
          </div>
        </div>
        <div v-if="dualDevice && scanMeta" class="flex shrink-0 items-center gap-2">
          <span class="hidden lg:inline text-gray-500 dark:text-gray-400 uppercase opacity-70">View</span>
          <UButton
            size="xs"
            :color="viewFormFactor === 'mobile' ? 'primary' : 'gray'"
            :variant="viewFormFactor === 'mobile' ? 'solid' : 'ghost'"
            @click="viewFormFactor = 'mobile'"
          >
            Mobile
          </UButton>
          <UButton
            size="xs"
            :color="viewFormFactor === 'desktop' ? 'primary' : 'gray'"
            :variant="viewFormFactor === 'desktop' ? 'solid' : 'ghost'"
            @click="viewFormFactor = 'desktop'"
          >
            Desktop
          </UButton>
        </div>
      </div>
      <div v-if="scanMeta?.monitor?.allTargets > 0" class="flex grow min-w-0 justify-around items-center gap-5 md:gap-7 md:px-2">
        <search-box class="w-full max-w-[9.5rem] sm:max-w-[11rem] md:max-w-[13rem] shrink-0" />
        <UDropdownMenu
          :items="[[{
            label: 'Rescan Site',
            description: 'Crawl the site again and generate fresh new reports.',
            icon: 'i-mdi-magnify-scan',
            disabled: isRescanSiteRequestRunning || isStatic || isOffline,
            onSelect: () => rescanSite(),
          }]]" :content="{ placement: 'bottom' }"
        >
          <UButton
            icon="i-heroicons-ellipsis-vertical"
            size="sm"
            color="gray"
            variant="ghost"
            :loading="isRescanSiteRequestRunning"
          />
        </UDropdownMenu>
      </div>
      <div v-if="!isOffline && scanMeta?.monitor" class="hidden xl:flex items-center gap-8 2xl:gap-10 shrink-0">
        <div>
          <stat-item
            label="Worker Progress"
            :value="`${scanMeta.monitor.donePercStr}% (${scanMeta.monitor.doneTargets}/${scanMeta.monitor.allTargets})`"
            size="sm"
          />
        </div>
        <div class="hidden xl:block">
          <stat-item
            label="Time Remaining"
            :value="scanMeta.monitor.status === 'completed' ? '-' : timeRemaining"
            size="sm"
          />
        </div>
        <div class="hidden xl:block">
          <stat-item
            label="CPU"
            :value="scanMeta.monitor.status === 'completed' ? '-' : scanMeta.monitor.cpuUsage"
            size="sm"
          />
        </div>
      </div>
    </div>
    <div class="hidden md:flex-auto min-w-[0]" />
    <div class="flex items-center gap-2 md:gap-3 shrink-0">
      <btn-icon
        class="icon-btn text-lg"
        href="https://github.com/harlan-zw/unlighthouse"
        target="_blank"
      >
        <UIcon name="i-carbon-logo-github" />
      </btn-icon>
      <btn-icon class="text-lg cursor-pointer" title="Toggle Dark Mode" @click="toggleDark()">
        <UIcon v-if="isDark" name="i-carbon-moon" />
        <UIcon v-else name="i-carbon-sun" />
      </btn-icon>
    </div>
  </nav>
</template>
