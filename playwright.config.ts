// e2e-пресет infra-site-kit: Chromium против `astro build && astro preview`.
import preset from '@aimuzov-projects/infra-site-kit/playwright'
import { defineConfig } from '@playwright/test'

// axe обходит все страницы sitemap одним тестом, а страницы движений грузят 3D-модель, как главная:
// на 52 страницах 30 с пресета мало, а три воркера с WebGL на процессоре тянут обход до двух минут
export default defineConfig(preset, { timeout: 180_000 })
