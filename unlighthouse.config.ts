import { defineConfig } from '@unlighthouse/core'

export default defineConfig({
  // Set your origin here, or pass `--site https://…` when running the CLI.
  // site: 'https://example.com',
  client: {
    faviconUrl: 'https://urbanstems.com/cdn/shop/files/favicon.png',
  },
  // Default `cache: true` avoids re-running Lighthouse for unchanged routes between runs.
  scanner: {
    suppressKlaviyo: true,
    dualDevice: true, // run Lighthouse for mobile and desktop; use the nav bar to switch views
    // Full URLs: XML sitemap, or HTML pages like https://urbanstems.com/pages/sitemap (links are extracted).
    // Raise maxRoutes if the sitemap lists more than the default cap.
    sitemap: ['https://urbanstems.com/pages/sitemap'],
    maxRoutes: 500,
    samples: 1,
    dynamicSampling: false,
    // Add path patterns (strings or RegExp) to skip noisy or dead URLs from the crawl.
    // Example: /^\/products\/old-handle/ or '/collections/sale-archive'
    exclude: [],
  },
  // Fewer bursts to the origin — helps with 429s and Cloudflare when scanning large sitemaps.
  puppeteerClusterOptions: {
    workerCreationDelay: 2000,
    maxConcurrency: 2,
    retryDelay: 5000,
  },
  // Saves each run under `.unlighthouse/history/<timestamp>/run.json` + `index.json` for local diffing.
  localHistory: {
    enabled: true,
    maxRuns: 20,
  },
})
