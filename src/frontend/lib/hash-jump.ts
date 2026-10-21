/**
 * Скрипт в `<head>` страницы статьи: заход по ссылке на раздел (`#urgent`) сразу открывает
 * раздел. Сам браузер прыгает к нему только к событию load, а до тех пор показывал начало
 * статьи. Пока разметка не разобрана, документ скрыт, потом раздел -- у верха без анимации.
 * Хеш Telegram и битый хеш пропускаем. Текст постоянный: хеш для CSP один на все статьи.
 */
export const HASH_JUMP = [
	'try{',
	'var d=document.documentElement,h=decodeURIComponent(location.hash.slice(1));',
	"if(h&&!/^tgWebApp/.test(h)){d.style.visibility='hidden';",
	"var show=function(){var t=document.getElementById(h);t&&t.scrollIntoView({block:'start',behavior:'instant'});",
	"d.style.visibility=''};",
	// Страховка: что-то пошло не так, а страница так и осталась бы скрытой
	'setTimeout(show,3000);',
	"document.addEventListener('readystatechange',function(){document.readyState!=='loading'&&show()},{once:true})}",
	'}catch(e){}',
].join('')
