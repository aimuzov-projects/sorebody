// e2e-пресет infra-site-kit: Chromium против `astro build && astro preview`.
import preset from '@aimuzov-projects/infra-site-kit/playwright'

// axe обходит весь sitemap одним тестом, а страницы движений грузят 3D-модель, как главная:
// 30 секунд пресета на полсотни таких страниц не хватает, а три воркера с WebGL
// на процессоре тянут обход до полутора-двух минут
export default { ...preset, timeout: 180_000 }
