/**
 * Выбранный спорт -- настройка вкладки, а не шаг истории. Внутри одной главной прошлые шаги
 * переписывает сама сцена (body-3d.svelte, onHistory), а между страницами помнит sessionStorage:
 * «Назад» на главную с другой страницы, если браузер грузит её заново, открывает выбранный спорт.
 */
const SPORT_KEY = 'wodcare:sport'

export function rememberSport(slug: string) {
	try {
		sessionStorage.setItem(SPORT_KEY, slug)
	} catch {
		// Без sessionStorage «Назад» между страницами просто вернёт спорт той страницы
	}
}

export function recalledSport() {
	try {
		return sessionStorage.getItem(SPORT_KEY)
	} catch {
		return null
	}
}

/**
 * Скрипт в `<head>`, до отрисовки: главная, открытая «Назад» или «Вперёд» не в выбранном спорте,
 * сразу уходит на главную выбранного с тем же хешем. Остальные страницы спорта, открытые обычным
 * переходом, делают свой спорт выбранным. Адреса главных -- в `<html data-sport-homes>`, он только
 * у главных. Текст постоянный: хеш для CSP один на все страницы.
 */
export const SPORT_RETURN = [
	'try{',
	'var d=document.documentElement,s=d.dataset.sport,h=d.dataset.sportHomes,',
	`k=${JSON.stringify(SPORT_KEY)},w=sessionStorage.getItem(k),`,
	"n=performance.getEntriesByType('navigation')[0],b=n&&n.type==='back_forward';",
	'if(s&&b&&h&&w&&w!==s){var to=JSON.parse(h)[w];if(to)location.replace(to+location.search+location.hash)}',
	'else if(s&&!b)sessionStorage.setItem(k,s)',
	'}catch(e){}',
].join('')
