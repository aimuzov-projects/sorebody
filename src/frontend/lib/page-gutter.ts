/**
 * Ширина страницы без места под полосу прокрутки окна: по ней раскладываются fixed-слои и
 * подсказки в верхнем слое. `clientWidth` у `<html>` её на главной не даёт: overflow: hidden
 * у body уходит окну, и Chrome отдаёт ширину без вычета места под полосу.
 */
export const pageWidth = () => document.body.getBoundingClientRect().width
