import { siteChecks } from '@aimuzov-projects/infra-site-kit/playwright/checks'

// Проверки, общие для всех сайтов: страницы из sitemap, axe, кнопка темы с подсмотром
// другой схемы и 404 из кита. Счётчика Метрики у сайта нет.
siteChecks({
	theme: { button: (page) => page.getByRole('button', { name: /^Тема:/ }) },
	notFound: true,
})
