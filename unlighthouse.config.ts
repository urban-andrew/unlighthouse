import { defineConfig } from '@unlighthouse/core'

export default defineConfig({
  // Set your origin here, or pass `--site https://…` when running the CLI.
  // site: 'https://example.com',
  scanner: {
    suppressKlaviyo: true,
    // Full URLs: XML sitemap, or HTML pages like https://urbanstems.com/pages/sitemap (links are extracted).
    // Raise maxRoutes if the sitemap lists more than the default cap.
    // sitemap: ['https://urbanstems.com/pages/sitemap'],
    // maxRoutes: 500,
  },
  // Saves each run under `.unlighthouse/history/<timestamp>/run.json` + `index.json` for local diffing.
  localHistory: {
    enabled: true,
    maxRuns: 20,
  },
})
