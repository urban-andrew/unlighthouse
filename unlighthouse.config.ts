import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  // Set your origin here, or pass `--site https://…` when running the CLI.
  // site: 'https://example.com',
  scanner: {
    suppressKlaviyo: true,
  },
})
