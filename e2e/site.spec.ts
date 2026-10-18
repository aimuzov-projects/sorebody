import { siteChecks } from '@aimuzov-projects/infra-site-kit/playwright/checks'

// Проверки, общие для всех сайтов: страницы из sitemap, axe и кнопка темы с подсмотром
// другой схемы. Счётчика Метрики у сайта нет.
siteChecks({
	theme: { button: (page) => page.getByRole('button', { name: /^Тема:/ }) },
})
