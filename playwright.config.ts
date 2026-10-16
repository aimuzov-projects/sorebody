// e2e-пресет infra-site-kit: Chromium против `astro build && astro preview`.
import preset from '@aimuzov-projects/infra-site-kit/playwright'
import { defineConfig } from '@playwright/test'

// axe обходит весь sitemap одним тестом, а главная и страницы движений грузят 3D-модель:
// 30 секунд пресета на полсотни таких страниц не хватает
export default defineConfig(preset, { timeout: 180_000 })
