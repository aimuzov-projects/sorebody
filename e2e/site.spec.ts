import { siteChecks } from '@aimuzov-projects/infra-site-kit/playwright/checks'

import { site } from '#frontend/data/site.ts'

// Проверки, общие для всех сайтов: страницы из sitemap, axe и Метрика, когда у сайта есть счётчик.
siteChecks({ metrika: Number.isInteger(site.metrikaId) })
