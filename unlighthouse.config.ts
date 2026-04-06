import { defineConfig } from '@unlighthouse/core'

export default defineConfig({
  // Set your origin here, or pass `--site https://…` when running the CLI.
  // site: 'https://example.com',
  scanner: {
    suppressKlaviyo: true,
  },
})
