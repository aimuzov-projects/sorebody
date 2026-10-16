// e2e-пресет infra-site-kit: Chromium против `astro build && astro preview`.
import preset from '@aimuzov-projects/infra-site-kit/playwright'
import { defineConfig } from '@playwright/test'

// axe обходит все страницы sitemap одним тестом: на 52 страницах 30 с уже мало
export default defineConfig(preset, { timeout: 120_000 })
