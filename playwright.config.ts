// e2e-пресет infra-site-kit: Chromium против `astro build && astro preview`.
import preset from '@aimuzov-projects/infra-site-kit/playwright'
import { defineConfig } from '@playwright/test'

const server = preset.webServer

if (!server || Array.isArray(server)) throw new Error('В пресете infra-site-kit ждали один webServer')

// axe обходит весь sitemap одним тестом, а сцены спортов и страницы элементов грузят
// 3D-модель: 30 секунд пресета на полсотни таких страниц не хватает.
// Сборка для e2e без Метрики: визиты из тестов не нужны в статистике (layouts/base.astro)
// Пресет разворачивается, а не передаётся в defineConfig вторым конфигом: при слиянии
// webServer пресета и свой встали бы в список и оба запускались бы на одном порту
export default defineConfig({
	...preset,
	timeout: 180_000,
	webServer: { ...server, env: { METRIKA: 'off' } },
})
