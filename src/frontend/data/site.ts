export const site = {
	/** Название сайта: `<title>` главной, `og:site_name`, хвост заголовков остальных страниц. */
	name: '__NAME__',
	/** `meta description` и `og:description` по умолчанию. */
	description: '__DESCRIPTION__',
	/** Номер счётчика Яндекс Метрики. В самом шаблоне это `NaN`, и тогда счётчика на странице нет. */
	metrikaId: Number('__METRIKA_ID__'),
	/** Репозиторий проекта, на него ведёт ссылка "Исходный код" в подписи автора в подвале. */
	repo: 'https://github.com/aimuzov-projects/__PROJECT__',
}
