<script setup lang="ts">
import UDropdownMenu from '@nuxt/ui/components/DropdownMenu.vue'
import { useTitle } from '@vueuse/core'
import { $fetch } from 'ofetch'
import { EXCLUDED_CATEGORIES } from './constants'
import {
  activeScreenshots,
  activeTab,
  apiUrl,
  basePath,
  categoryScores,
  changedTab,
  closeThumbnailsModal,
  contentModalOpen,
  device,
  dualDevice,
  dualViewTick,
  dynamicSampling,
  iframeModalUrl,
  incrementSort,
  isDebugModalOpen,
  isOffline,
  isRefreshLighthouseFormFactorRunning,
  isRouteSelected,
  isStatic,
  lighthouseOptions,
  lighthouseReportModalOpen,
  openDebugModal,
  openLighthouseReportIframeModal,
  page,
  paginatedResults,
  perPage,
  refreshLighthouseFormFactor,
  refreshScanMeta,
  rescanRoute,
  resultColumns,
  searchResults,
  searchText,
  selectSameGroupAs,
  shouldShowWaitingState,
  sorting,
  tabs,
  throttle,
  thumbnailsModalOpen,
  toggleRouteSelection,
  website,
  wsConnect,
} from './logic'

const cruxMobile = ref(null)
const cruxDesktop = ref(null)
const cruxLoading = ref(false)
const cruxError = ref(false)
/** Which CrUX form-factor series is shown (matches Chrome UX Report History API). */
const cruxFormFactor = ref<'mobile' | 'desktop'>(device === 'desktop' ? 'desktop' : 'mobile')

const activeCrux = computed(() => (cruxFormFactor.value === 'desktop' ? cruxDesktop.value : cruxMobile.value))

if (!isStatic) {
  let refreshInterval: NodeJS.Timeout | null = null

  onMounted(() => {
    wsConnect().catch((error) => {
      console.warn('Failed to establish server connection:', error)
    })

    refreshInterval = setInterval(() => {
      refreshScanMeta()
    }, 5000)

    cruxLoading.value = true
    const base = `https://crux.unlighthouse.dev/api/${encodeURIComponent(website)}/crux/history`
    Promise.allSettled([
      $fetch(`${base}?formFactor=PHONE`),
      $fetch(`${base}?formFactor=DESKTOP`),
    ]).then((results) => {
      const [phone, desktop] = results
      if (phone.status === 'fulfilled')
        cruxMobile.value = phone.value
      else
        console.warn('Failed to fetch CrUX mobile data:', phone.reason)

      if (desktop.status === 'fulfilled')
        cruxDesktop.value = desktop.value
      else
        console.warn('Failed to fetch CrUX desktop data:', desktop.reason)

      cruxError.value = phone.status === 'rejected' && desktop.status === 'rejected'
    }).finally(() => {
      cruxLoading.value = false
    })
  })

  onUnmounted(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval)
      refreshInterval = null
    }
  })
}

function openPsi(report) {
  window.open(`https://pagespeed.web.dev/report?url=${encodeURIComponent(report.route.url)}`, '_blank')
}

// Computed for complex template expressions
const shouldShowCategoryScore = computed(() => (category, key) => {
  return !EXCLUDED_CATEGORIES.includes(category.label) && categoryScores.value[key - 1] > 0
})

const shouldShowCruxTab = computed(() => {
  if (isStatic)
    return false
  if (cruxLoading.value)
    return true
  if (cruxError.value)
    return true
  const m = cruxMobile.value
  const d = cruxDesktop.value
  return Boolean((m && m.exists !== false) || (d && d.exists !== false))
})

const filteredTabs = computed(() => {
  if (!shouldShowCruxTab.value) {
    return tabs.filter(tab => tab.label !== 'CrUX')
  }
  return tabs
})

const getDropdownActions = computed(() => (report) => {
  const actions = []

  if (report.report) {
    actions.push({
      icon: 'i-heroicons-document-text',
      label: 'Open Lighthouse Report',
      description: 'Lighthouse HTML report is opened in a modal.',
      onSelect: () => openLighthouseReportIframeModal(report),
      disabled: false,
    })
  }

  actions.push({
    icon: 'i-heroicons-arrow-path',
    label: 'Rescan Route',
    description: 'Crawl the route again and generate a fresh report.',
    onSelect: () => rescanRoute(report.route),
    disabled: unref(isOffline) || unref(isStatic),
  })

  if (report.report) {
    actions.push({
      icon: 'i-mdi-speedometer',
      label: 'Run PageSpeed Insights',
      description: 'Get more accurate performance data by running a PageSpeed Insights test.',
      onSelect: () => openPsi(report),
      disabled: false,
    })
  }

  return [actions]
})

useTitle(`${website.replace(/https?:\/\/(www.)?/, '')} | Unlighthouse`)
</script>

<template>
  <UApp>
    <div class="text-gray-700 dark:text-gray-200 overflow-y-hidden max-h-screen h-screen grid grid-rows-[min-content_1fr]">
      <NavBar />
      <main class="xl:flex mt-2 mb-2">
        <div class="flex justify-between max-h-[95%] flex-col xl:ml-3 mx-3 mr-0 w-full xl:mr-5 xl:w-[250px] xl:mb-0">
          <div>
            <TabGroup vertical @change="changedTab">
              <TabList class="xl:block xl:space-x-0 flex space-x-2 mb-3">
                <Tab
                  v-for="(category, key) in filteredTabs"
                  :key="key"
                  v-slot="{ selected }"
                  as="template"
                >
                  <btn-tab
                    :selected="selected"
                  >
                    <span class="inline-flex items-center space-x-1">
                      <UIcon :name="category.icon" class="inline text-sm opacity-40 h-4 w-4" />
                      <span>{{ category.label }}</span>
                      <tooltip v-if="category.label === 'Performance'" class="text-left">
                        <UIcon name="i-carbon-warning" class="inline text-xs mx-1" />
                        <template #tooltip>
                          <div class="mb-2">Lighthouse is running with variability. Performance scores should not be considered accurate.</div>
                          <div>Unlighthouse is running <span class="underline">with{{ throttle ? '' : 'out' }} throttling</span> which will also effect scores.</div>
                        </template>
                      </tooltip>
                    </span>
                    <metric-guage v-if="shouldShowCategoryScore(category, key)" :score="categoryScores[key - 1]" :stripped="true" class="dark:font-bold" :class="selected ? ['dark:bg-teal-900 bg-blue-100 rounded px-2'] : []" />
                  </btn-tab>
                </Tab>
              </TabList>
            </TabGroup>
            <div v-if="dualDevice && activeTab === 0 && !isStatic" class="mt-3 space-y-2">
              <div class="text-xs uppercase opacity-60">
                Refresh Lighthouse
              </div>
              <div class="flex flex-wrap gap-2">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="outline"
                  :disabled="isOffline"
                  :loading="isRefreshLighthouseFormFactorRunning"
                  @click="refreshLighthouseFormFactor('mobile')"
                >
                  Run mobile
                </UButton>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="outline"
                  :disabled="isOffline"
                  :loading="isRefreshLighthouseFormFactorRunning"
                  @click="refreshLighthouseFormFactor('desktop')"
                >
                  Run desktop
                </UButton>
              </div>
            </div>
            <div v-if="dynamicSampling" class="text-sm opacity-70 mt-3">
              <p>Dynamically sampling is enabled, not all pages are being scanned.</p>
              <p><a href="https://unlighthouse.dev/guide/guides/dynamic-sampling" target="_blank" class="underline">Learn more</a></p>
            </div>
          </div>
          <div class="hidden xl:block">
            <lighthouse-three-d v-if="!isStatic" class="mb-7" />
            <div class="px-2 text-center xl:text-left">
              <div class="text-xs opacity-75 xl:mt-4">
                <a href="https://unlighthouse.dev" target="_blank" class="underline hover:no-underline">Documentation</a>
                <btn-action v-if="!isStatic" class="underline hover:no-underline ml-3" @click="openDebugModal">
                  Debug
                </btn-action>
              </div>
              <div class="text-xs opacity-75 xl:mt-4">
                Made with <UIcon name="i-simple-line-icons-heart" title="Love" class="inline" aria-label="love" /> by <a href="https://twitter.com/harlan_zw" target="_blank" class="underline hover:no-underline">@harlan_zw</a>
              </div>
              <div class="text-xs opacity-50 xl:mt-4 mt-1">
                Portions of this report use Lighthouse. For more information visit <a href="https://developers.google.com/web/tools/lighthouse" class="underline hover:no-underline">here</a>.
              </div>
            </div>
          </div>
        </div>
        <div class="xl:w-full px-3 mr-5">
          <div v-if="filteredTabs[activeTab]?.label === 'CrUX'">
            <div class="flex flex-col gap-4 mb-6">
              <div>
                <h2 class="font-bold text-2xl mb-2">
                  Origin CrUX History — {{ cruxFormFactor === 'desktop' ? 'Desktop' : 'Mobile' }}
                </h2>
                <p class="text-sm opacity-80 max-w-3xl">
                  Field <abbr title="75th percentile">p75</abbr> time series from the Chrome UX Report History API. The official Core Web Vitals are LCP, INP, and CLS; FCP, TTFB, and FID add context (FID is legacy—prefer INP).
                </p>
              </div>
              <div v-if="!cruxLoading && !cruxError" class="flex flex-wrap items-center gap-2">
                <span class="text-xs uppercase opacity-60">Form factor</span>
                <UButton
                  size="xs"
                  :color="cruxFormFactor === 'mobile' ? 'primary' : 'neutral'"
                  :variant="cruxFormFactor === 'mobile' ? 'solid' : 'outline'"
                  @click="cruxFormFactor = 'mobile'"
                >
                  Mobile
                </UButton>
                <UButton
                  size="xs"
                  :color="cruxFormFactor === 'desktop' ? 'primary' : 'neutral'"
                  :variant="cruxFormFactor === 'desktop' ? 'solid' : 'outline'"
                  @click="cruxFormFactor = 'desktop'"
                >
                  Desktop
                </UButton>
              </div>
            </div>
            <div v-if="cruxLoading && !cruxError" class="w-full">
              <div class="text-gray-500 text-center w-full text-sm">
                Loading CrUX data...
              </div>
            </div>
            <div v-else-if="cruxError" class="w-full">
              <div class="flex items-center justify-center space-x-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                <UIcon name="i-carbon-warning" class="text-red-600 dark:text-red-400 text-xl" />
                <div class="text-center">
                  <p class="font-medium text-red-800 dark:text-red-200">
                    Failed to Load CrUX Data
                  </p>
                  <p class="text-sm text-red-700 dark:text-red-300 mt-1">
                    Unlighthouse CrUX API is currently unavailable for both mobile and desktop.
                  </p>
                </div>
              </div>
            </div>
            <div v-else-if="!activeCrux || activeCrux.exists === false" class="w-full">
              <div class="text-gray-500 text-sm max-w-2xl">
                <template v-if="!activeCrux">
                  Could not load CrUX for <strong>{{ cruxFormFactor === 'desktop' ? 'desktop' : 'mobile' }}</strong>. The request may have failed or the public API did not return this series.
                </template>
                <template v-else>
                  No Chrome UX Report field data for <strong>{{ cruxFormFactor === 'desktop' ? 'desktop' : 'mobile' }}</strong> for this origin. Try the other form factor, or confirm the site has enough CrUX traffic.
                </template>
              </div>
            </div>
            <div v-else class="w-full flex-col flex space-y-8">
              <div>
                <h3 class="font-semibold text-lg mb-4">
                  Core Web Vitals
                </h3>
                <div class="flex-col flex space-y-5">
                  <div>
                    <div>
                      <a href="https://web.dev/articles/lcp" target="_blank" class="transition hover:underline">Largest Contentful Paint (LCP)</a>
                    </div>
                    <div v-if="activeCrux?.lcp" class="flex items-center">
                      <div class="w-full h-[200px] w-[400px] relative">
                        <CruxGraphLcp v-if="activeCrux?.lcp" :value="activeCrux.lcp" :height="200" />
                      </div>
                      <div>
                        <div class="text-green-500 font-bold">
                          Good &lt; 2.5s
                        </div>
                        <div class="text-yellow-500 font-bold">
                          Needs Improvement 2.5s - 4s
                        </div>
                        <div class="text-red-500 font-bold">
                          Poor &gt; 4s
                        </div>
                      </div>
                    </div>
                    <div v-else class="inline">
                      <div class="text-gray-500 text-center inline w-full text-sm">
                        No data
                      </div>
                    </div>
                  </div>
                  <div>
                    <div>
                      <a href="https://web.dev/articles/inp" target="_blank" class="transition hover:underline">Interaction to Next Paint (INP)</a>
                    </div>
                    <div v-if="activeCrux?.inp" class="flex items-center">
                      <div class="w-full h-[200px] w-[400px] relative">
                        <CruxGraphInp v-if="activeCrux?.inp" :value="activeCrux.inp" :height="200" />
                      </div>
                      <div>
                        <div class="text-green-500 font-bold">
                          Good &lt; 200ms
                        </div>
                        <div class="text-yellow-500 font-bold">
                          Needs Improvement 200ms - 500ms
                        </div>
                        <div class="text-red-500 font-bold">
                          Poor &gt; 500ms
                        </div>
                      </div>
                    </div>
                    <div v-else class="inline">
                      <div class="inline text-gray-500 text-center w-full text-sm">
                        No data
                      </div>
                    </div>
                  </div>
                  <div>
                    <div><a href="https://web.dev/articles/cls" target="_blank" class="transition hover:underline">Cumulative Layout Shift (CLS)</a></div>
                    <div v-if="activeCrux?.cls" class="flex items-center">
                      <div class="w-full h-[200px] w-[400px] relative">
                        <CruxGraphCls v-if="activeCrux?.cls" :value="activeCrux.cls" :height="200" />
                      </div>
                      <div>
                        <div class="text-green-500 font-bold">
                          Good &lt; 0.1
                        </div>
                        <div class="text-yellow-500 font-bold">
                          Needs Improvement 0.1 - 0.25
                        </div>
                        <div class="text-red-500 font-bold">
                          Poor &gt; 0.25
                        </div>
                      </div>
                    </div>
                    <div v-else class="inline">
                      <div class="text-gray-500 inline text-center w-full text-sm">
                        No data
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <h3 class="font-semibold text-lg mb-4">
                  Other field metrics
                </h3>
                <div class="flex-col flex space-y-5">
                  <div>
                    <div>
                      <a href="https://web.dev/articles/fcp" target="_blank" class="transition hover:underline">First Contentful Paint (FCP)</a>
                    </div>
                    <div v-if="activeCrux?.fcp" class="flex items-center">
                      <div class="w-full h-[200px] w-[400px] relative">
                        <CruxGraphFcp v-if="activeCrux?.fcp" :value="activeCrux.fcp" :height="200" />
                      </div>
                      <div>
                        <div class="text-green-500 font-bold">
                          Good &lt; 1.8s
                        </div>
                        <div class="text-yellow-500 font-bold">
                          Needs Improvement 1.8s - 3s
                        </div>
                        <div class="text-red-500 font-bold">
                          Poor &gt; 3s
                        </div>
                      </div>
                    </div>
                    <div v-else class="inline">
                      <div class="text-gray-500 text-center inline w-full text-sm">
                        No data
                      </div>
                    </div>
                  </div>
                  <div>
                    <div>
                      <a href="https://web.dev/ttfb/" target="_blank" class="transition hover:underline">Time to First Byte (TTFB)</a>
                    </div>
                    <div v-if="activeCrux?.ttfb" class="flex items-center">
                      <div class="w-full h-[200px] w-[400px] relative">
                        <CruxGraphTtfb v-if="activeCrux?.ttfb" :value="activeCrux.ttfb" :height="200" />
                      </div>
                      <div>
                        <div class="text-green-500 font-bold">
                          Good &lt; 800ms
                        </div>
                        <div class="text-yellow-500 font-bold">
                          Needs Improvement 800ms - 1.8s
                        </div>
                        <div class="text-red-500 font-bold">
                          Poor &gt; 1.8s
                        </div>
                      </div>
                    </div>
                    <div v-else class="inline">
                      <div class="text-gray-500 text-center inline w-full text-sm">
                        No data
                      </div>
                    </div>
                  </div>
                  <div>
                    <div>
                      <a href="https://web.dev/fid/" target="_blank" class="transition hover:underline">First Input Delay (FID)</a>
                      <span class="text-xs opacity-70 ml-1">(legacy)</span>
                    </div>
                    <div v-if="activeCrux?.fid" class="flex items-center">
                      <div class="w-full h-[200px] w-[400px] relative">
                        <CruxGraphFid v-if="activeCrux?.fid" :value="activeCrux.fid" :height="200" />
                      </div>
                      <div>
                        <div class="text-green-500 font-bold">
                          Good &lt; 100ms
                        </div>
                        <div class="text-yellow-500 font-bold">
                          Needs Improvement 100ms - 300ms
                        </div>
                        <div class="text-red-500 font-bold">
                          Poor &gt; 300ms
                        </div>
                      </div>
                    </div>
                    <div v-else class="inline">
                      <div class="text-gray-500 text-center inline w-full text-sm">
                        No data
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div v-else-if="filteredTabs[activeTab]?.label === 'Historical'">
            <HistoricalDashboard />
          </div>
          <template v-else-if="!shouldShowWaitingState">
            <div class="pr-10 pb-1 w-full min-w-[1500px]">
              <div class="grid grid-cols-12 gap-4 text-sm dark:text-gray-300 text-gray-700">
                <results-table-head
                  v-for="(column, key) in resultColumns"
                  :key="key"
                  :sorting="sorting"
                  :column="column"
                  @sort="incrementSort"
                />
              </div>
            </div>
            <div class="w-full min-w-[1500px] pr-3 overflow-y-auto xl:max-h-[calc(100vh-100px)] lg:max-h-[calc(100vh-205px)] sm:max-h-[calc(100vh-220px)] max-h-[calc(100vh-250px)]">
              <div v-if="Object.values(searchResults).length === 0" class="px-4 py-3">
                <template v-if="searchText">
                  <p class="mb-2">
                    No results for search "{{ searchText }}"...
                  </p>
                  <btn-action class="dark:bg-teal-700 bg-blue-100 px-2 text-sm" @click="searchText = ''">
                    Reset Search
                  </btn-action>
                </template>
                <template v-else-if="isOffline && !isStatic">
                  <div class="flex items-center space-x-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                    <UIcon name="i-carbon-warning-alt" class="text-yellow-600 dark:text-yellow-400 text-xl" />
                    <div>
                      <p class="font-medium text-yellow-800 dark:text-yellow-200">
                        Server Connection Lost
                      </p>
                      <p class="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                        The Unlighthouse client is running but cannot connect to the server.
                        Please ensure the Unlighthouse server is running and accessible.
                      </p>
                    </div>
                  </div>
                </template>
                <template v-else-if="isStatic && (!(window as any).__unlighthouse_payload?.reports || (window as any).__unlighthouse_payload.reports.length === 0)">
                  <div class="flex items-center space-x-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <UIcon name="i-carbon-information" class="text-blue-600 dark:text-blue-400 text-xl" />
                    <div>
                      <p class="font-medium text-blue-800 dark:text-blue-200">
                        No Report Data
                      </p>
                      <p class="text-sm text-blue-700 dark:text-blue-300 mt-1">
                        This is a static client build with no report data.
                        Generate reports using the Unlighthouse CLI to see lighthouse results here.
                      </p>
                    </div>
                  </div>
                </template>
                <div v-else class="flex items-center">
                  <loading-spinner class="mr-2" aria-label="Loading" />
                  <div>
                    <p aria-live="polite">
                      Waiting for routes...
                    </p>
                    <span class="text-xs opacity-50">If this hangs consider running Unlighthouse with --debug.</span>
                  </div>
                </div>
              </div>
              <div v-else-if="searchText" class="px-4 py-3">
                <p id="search-results-status" aria-live="polite">
                  Showing {{ Object.values(searchResults).flat().length }} routes for search "{{ searchText }}":
                </p>
              </div>
              <results-route
                v-for="(report, routeName) in paginatedResults"
                :key="routeName"
                v-memo="[report.route.url, report.report?.categories, report.tasks.runLighthouseTask, isRouteSelected(report.route.id), dualViewTick]"
                :report="report"
              >
                <template #select="{ report: r }">
                  <div class="flex flex-col items-center gap-1">
                    <input
                      type="checkbox"
                      class="rounded border-gray-400 dark:border-gray-500 cursor-pointer"
                      :checked="isRouteSelected(r.route.id)"
                      :disabled="isOffline || isStatic"
                      @change="toggleRouteSelection(r)"
                    >
                    <btn-action
                      class="text-[10px] px-1 py-0.5 rounded"
                      :disabled="isOffline || isStatic ? 'disabled' : false"
                      title="Select all routes that share the same route definition as this row"
                      @click="selectSameGroupAs(r)"
                    >
                      Select
                    </btn-action>
                  </div>
                </template>
                <template #actions>
                  <UDropdownMenu :items="getDropdownActions(report)" :content="{ placement: 'left' }">
                    <UButton
                      icon="i-heroicons-ellipsis-vertical"
                      size="sm"
                      color="neutral"
                      variant="ghost"
                    />
                  </UDropdownMenu>
                </template>
              </results-route>
              <div v-if="searchResults.length > perPage" class="flex items-center space-x-4 mt-5">
                <Pagination v-model="page" :page-count="perPage" :total="searchResults.length" />
                <div class="opacity-70">
                  {{ searchResults.length }} total
                </div>
              </div>
            </div>
          </template>
          <template v-else>
            <!-- Waiting state: show clean message instead of broken table -->
            <div class="flex flex-col items-center justify-center py-20 px-4">
              <div class="text-center max-w-md">
                <div class="mb-6">
                  <template v-if="isStatic">
                    <UIcon name="i-carbon-information" class="text-blue-500 text-4xl mx-auto mb-4" />
                    <h3 class="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
                      No Report Data Available
                    </h3>
                    <p class="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                      This is a static Unlighthouse client with no report data.
                      Generate reports using the Unlighthouse CLI to see results here.
                    </p>
                  </template>
                  <template v-else>
                    <UIcon name="i-carbon-warning-alt" class="text-yellow-500 text-4xl mx-auto mb-4" />
                    <h3 class="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
                      Waiting for Server Connection
                    </h3>
                    <p class="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                      The Unlighthouse client is running but cannot connect to the server.
                      Please ensure the Unlighthouse server is running and accessible.
                    </p>
                    <div class="flex items-center justify-center space-x-2 text-sm text-gray-500 dark:text-gray-400 mt-4">
                      <loading-spinner class="w-4 h-4" />
                      <span>Attempting to connect...</span>
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </template>
        </div>
      </main>
      <footer class="block xl:hidden my-2">
        <div class="px-2 text-center xl:text-left">
          <div class="flex items-center justify-around">
            <div class="text-xs opacity-75 xl:mt-4">
              <a href="https://unlighthouse.dev" target="_blank" class="underline">Unlighthouse</a>
            </div>
            <div class="text-xs opacity-75 xl:mt-4">
              Made with <UIcon name="i-simple-line-icons-heart" title="Love" class="inline" aria-label="love" /> by <a href="https://twitter.com/harlan_zw" target="_blank" class="underline">@harlan_zw</a>
            </div>
          </div>
          <div class="text-xs opacity-50 xl:mt-4 mt-1">
            Portions of this report use Lighthouse. For more information visit <a href="https://developers.google.com/web/tools/lighthouse" class="underline">here</a>.
          </div>
        </div>
      </footer>
      <!-- Debug Modal -->
      <UModal v-model:open="isDebugModalOpen" title="Debug Information">
        <template #body>
          <div class="p-5 bg-gray-100 dark:bg-gray-800">
            <div class="font-bold mb-3 text-xl">
              Core
            </div>
            <div class="mb-2">
              Base path: {{ basePath }}
            </div>
            <div class="mb-2">
              API URL: {{ apiUrl }}
            </div>
            <div class="font-bold mb-3 mt-5 text-xl">
              Scan
            </div>
            <div class="mb-2">
              Throttle: {{ throttle }}
            </div>
            <div class="mb-2">
              Device: {{ device }}
            </div>
            <div class="mb-2">
              Dynamic Sampling: {{ dynamicSampling }}
            </div>
            <div class="mb-2">
              Lighthouse Options: <code><pre>{{ lighthouseOptions }}</pre></code>
            </div>
            <div class="mb-2">
              Search Results: <code><pre>{{ searchResults }}</pre></code>
            </div>
          </div>
        </template>
      </UModal>

      <!-- Lighthouse Report Modal -->
      <UModal
        v-model:open="lighthouseReportModalOpen" title="Lighthouse Report" :ui="{
          content: '!max-w-5xl',
        }"
      >
        <template #body>
          <iframe v-if="iframeModalUrl" :src="iframeModalUrl" class="w-full h-[85vh] bg-white" />
        </template>
      </UModal>

      <!-- Image/Content Modal -->
      <UModal v-model:open="contentModalOpen">
        <template #body>
          <div id="modal-portal" />
        </template>
      </UModal>

      <!-- Screenshot Thumbnails Modal -->
      <ModalThumbnails
        v-model:open="thumbnailsModalOpen"
        :screenshots="activeScreenshots"
        @close="closeThumbnailsModal"
      />
    </div>
  </UApp>
</template>
