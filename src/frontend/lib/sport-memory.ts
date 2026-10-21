/**
 * Выбранный спорт -- настройка вкладки, а не шаг истории. Внутри одной главной прошлые шаги
 * переписывает сама сцена (body-3d.svelte, onHistory), а между страницами помнит sessionStorage:
 * «Назад» на главную с другой страницы, если браузер грузит её заново, открывает выбранный спорт.
 */
const SPORT_KEY = 'wodcare:sport'

/** Атрибут `<html>` у главной, которая уходит из `<head>` на главную выбранного спорта. */
export const SPORT_LEAVING = 'data-sport-leaving'

/**
 * Событие на `document`: уход не случился (его отменили Esc или кнопкой "Стоп", вебвью не
 * пустил), и главная осталась. Её снова видно, Метрика включается по нему (components/metrika.astro).
 */
export const SPORT_STAY = 'wodcare:sport-stay'

/** Через сколько миллисекунд считать, что уход не случился. */
const STAY_AFTER = 3000

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
 * Скрипт в `<head>`, до отрисовки: главная, открытая «Назад», «Вперёд» или перезагрузкой не в
 * выбранном спорте, сразу уходит на главную выбранного с тем же хешем. Перезагрузкой её открывает
 * страница статьи, вставшая на чужую запись истории (components/injury-article.astro). До ухода документ скрыт: парсер успел бы
 * показать главную прежнего спорта. Метрика на уходящей странице не включается (SPORT_LEAVING).
 * Не ушла за STAY_AFTER -- страница снова видна, а Метрика включается (SPORT_STAY).
 * Остальные страницы спорта, открытые обычным переходом, делают свой спорт выбранным. Адреса
 * главных -- в `<html data-sport-homes>`, он только у главных. Текст постоянный: хеш для CSP один
 * на все страницы. Хеш зоны, которой нет у выбранного спорта, отбросит уже его главная (body-3d).
 */
export const SPORT_RETURN = [
	'try{',
	'var d=document.documentElement,s=d.dataset.sport,h=d.dataset.sportHomes,',
	`k=${JSON.stringify(SPORT_KEY)},w=sessionStorage.getItem(k),`,
	"n=performance.getEntriesByType('navigation')[0],b=n&&(n.type==='back_forward'||n.type==='reload');",
	'if(s&&b&&h&&w&&w!==s){var to=JSON.parse(h)[w];',
	`if(to){d.style.visibility='hidden';d.setAttribute(${JSON.stringify(SPORT_LEAVING)},'');`,
	`setTimeout(function(){d.style.visibility='';d.removeAttribute(${JSON.stringify(SPORT_LEAVING)});`,
	`document.dispatchEvent(new Event(${JSON.stringify(SPORT_STAY)}))},${STAY_AFTER});`,
	'location.replace(to+location.search+location.hash)}}',
	'else if(s&&!b)sessionStorage.setItem(k,s)',
	'}catch(e){}',
].join('')
