import { defineConfig } from '@playwright/test'
import base from './playwright.auth.config'
export default defineConfig({ ...base, testDir: './asset-delete', testMatch: 'real.spec.ts', testIgnore: [],
  outputDir: process.env.RAINBOW_AUTH_RESULTS_DIR,
})
