import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  // Required for route discovery and same-origin filtering (must match URLs from sitemap/crawl).
  site: 'https://urbanstems.com',
  client: {
    faviconUrl: 'https://urbanstems.com/cdn/shop/files/favicon.png',
    // Optional: CrUX p75 budgets, regression thresholds, doc links for the Performance monitoring strip.
    cwvMonitoring: {
      // cruxBudgets: { lcpMs: 2500, inpMs: 200, cls: 0.1 },
      // siteScoreRegressionDeltaPct: -3,
      // cruxRegressionAbs: { lcpMs: 200, inpMs: 20, cls: 0.02 },
      // rumDocsUrl: 'https://web.dev/vitals/',
      // schedulingDocsUrl: 'https://unlighthouse.dev/',
    },
  },
  // Default `cache: true` avoids re-running Lighthouse for unchanged routes between runs.
  scanner: {
    suppressKlaviyo: true,
    dualDevice: true, // Lighthouse for mobile and desktop; switch views in the nav bar
    // Full URL list: default `${site}/sitemap.xml` plus any `Sitemap:` entries from robots.txt.
    // With 50+ sitemap URLs (non-localhost), the HTML crawler auto-disables and only sitemap URLs are queued.
    sitemap: "https://urbanstems.com/sitemap.xml",
    robotsTxt: true,
    crawler: true, // used if sitemap is missing or empty; otherwise core may turn this off when sitemap is large
    // No practical cap for large catalogs. Use `false` instead on Unlighthouse ≥0.17 if your types/runtime allow it.
    maxRoutes: 1000,
    samples: 1,
    dynamicSampling: false, // do not sample within route groups; scan every queued URL
    // Add path patterns (strings or RegExp) to skip noisy or dead URLs.
    exclude: [],
  },
  // Slower pacing helps with 429s / Cloudflare on large runs.
  puppeteerClusterOptions: {
    workerCreationDelay: 2000,
    maxConcurrency: 2,
    retryDelay: 5000,
  },
  localHistory: {
    enabled: true,
    maxRuns: 20,
    /** Stored on each `run.json`; set before a scan to label the snapshot (e.g. git tag or deploy id). */
    // runAnnotation: 'v1.2.3',
  },
})
