/**
 * Цвета сайта из темы Telegram (lib/telegram.ts). Акцент на странице спорта остаётся цветом
 * спорта: он знак спорта на всём сайте, цвет ссылок Telegram его не заменяет. Без спорта акцент
 * -- графит, то есть цвет текста из темы Telegram, а знаки на его заливке -- цветом фона: тема
 * Telegram может не совпасть с темой сайта, и свой --on-accent сайта на ней пропадёт. Градиента
 * бренда в ссылках, значках и кнопке меню тут тоже нет (styles/global.css): его контраст проверен
 * на фонах сайта, а не клиента.
 */
export function telegramThemeVars(theme: Record<string, string | undefined>, hasSport: boolean) {
	return {
		'--bg': theme.bg_color,
		'--fg': theme.text_color,
		'--muted': theme.hint_color,
		'--accent': hasSport ? undefined : theme.text_color,
		'--on-accent': hasSport ? undefined : theme.bg_color,
		'--surface': theme.secondary_bg_color,
	}
}
