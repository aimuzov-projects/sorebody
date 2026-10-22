<!--
	Выбор спорта во фразе заголовка: «Травмы ‹в паделе ▾›» на главной, «Разбор ‹в кроссфите ▾›»
	в статье. Кнопка -- сама фраза спорта, список -- как у фильтра движения (popup-select).
	Скринридер читает «Вид спорта, Падел». Переход -- только по явному выбору другого спорта.
	Без `onchoose` (остров отдельной страницы статьи) -- на статью спорта к разделу, который сейчас
	читают. Спорт -- настройка, а не шаг: адрес заменяется, «Назад» ведёт туда, откуда пришли.
-->
<script lang="ts">
	import PopupSelect from '#frontend/components/popup-select.svelte'
	import { SPORT_ICONS } from '#frontend/data/sport-icons.ts'
	import type { SportSlug } from '#frontend/data/sports.ts'
	import { currentSection, ROLL_KEY } from '#frontend/lib/sport-switch.ts'

	type SportOption = { slug: string; title: string; phrase: string; href: string }

	let {
		sports,
		value,
		size,
		onchoose,
	}: {
		sports: SportOption[]
		value: string
		size: 'title' | 'lead'
		onchoose?: (sport: SportOption) => void
	} = $props()

	const id = $props.id()

	const indexOf = (slug: string) => sports.findIndex((s) => s.slug === slug)

	/**
	 * На сколько граней провернуть барабан от одного спорта к другому. Барабан -- кольцо (за
	 * последним спортом первый), крутим по кратчайшему пути: плюс -- новый спорт приходит снизу,
	 * минус -- сверху.
	 */
	function stepsTo(from: string, to: string) {
		const step = (indexOf(to) - indexOf(from) + sports.length) % sports.length

		return step <= sports.length / 2 ? step : step - sports.length
	}

	const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches

	/** Грани кольца: текущий спорт и по половине остальных сверху и снизу, при чётном числе -- без повтора. */
	const shifts = $derived.by(() => {
		const half = Math.floor(sports.length / 2)

		return [...Array(sports.length).keys()]
			.map((i) => i - half)
			.filter((i) => !(sports.length % 2 === 0 && i === -half))
	})

	/** Яркость грани: текущая -- полная, соседние -- бледные, дальние не видны. */
	const level = (shift: number) => (shift === 0 ? 'full' : Math.abs(shift) === 1 ? 'dim' : 'none')

	/**
	 * Ширина барабана -- по фразе текущего спорта, заданная явно: при смене спорта она плавно
	 * меняется, и шеврон за фразой едет, а не прыгает. Первая ширина ставится без анимации.
	 */
	function fit(drum: HTMLElement) {
		const phrase = drum.querySelector<HTMLElement>('.sswitch__size')!
		const resize = () => (drum.style.width = `${phrase.getBoundingClientRect().width}px`)
		const observer = new ResizeObserver(resize)

		resize()
		requestAnimationFrame(() => drum.classList.add('sswitch__drum--fitted'))
		observer.observe(phrase)

		return () => observer.disconnect()
	}

	/** На сколько граней барабан сейчас докручивается; 0 -- стоит. */
	let roll = $state(0)
	/** Спорт, к которому барабан уже провёрнут; до первого прогона эффекта -- нет. */
	let shown: string | undefined

	// При заходе барабан стоит. Пришли выбором спорта в статье -- фразу провёл
	// переход между страницами (lib/sport-switch.ts). Где их нет (Firefox) -- докручиваем сами
	$effect(() => {
		try {
			const chosen = Number(sessionStorage.getItem(ROLL_KEY))

			sessionStorage.removeItem(ROLL_KEY)

			if (chosen && !still() && !('onpagereveal' in window)) roll = chosen
		} catch {
			// Хранилище закрыто: докручивать нечего
		}
	})

	// Спорт сменился не через список (назад-вперёд по истории): барабан тоже проворачивается
	$effect(() => {
		if (value === shown) return

		if (shown !== undefined && !still()) roll = stepsTo(shown, value)

		shown = value
	})

	function choose(slug: string) {
		const target = sports.find((s) => s.slug === slug)

		if (!target || slug === value) return

		// Направление -- до смены спорта: новая фраза рисуется сразу провёрнутой куда надо
		const steps = stepsTo(value, slug)

		if (!still()) roll = steps

		shown = slug

		if (onchoose) return onchoose(target)

		const section = currentSection(document)

		// Адрес заменяется, и у новой страницы referrer -- свой сайт: стрелка «Назад» (back-link)
		// решила бы, что пришли с сайта, и ушла бы в поисковик. Пришли извне -- referrer не отдаём
		if (!document.referrer || new URL(document.referrer).origin !== location.origin)
			document.head.append(
				Object.assign(document.createElement('meta'), { name: 'referrer', content: 'no-referrer' }),
			)

		try {
			sessionStorage.setItem(ROLL_KEY, String(steps))
		} catch {
			// Без хранилища новая страница просто не докрутит барабан
		}

		location.replace(section ? `${target.href}#${section}` : target.href)
	}
</script>

<span class="sswitch__label" id="{id}-label">Вид спорта</span><PopupSelect
	options={sports.map((s) => ({ ...s, icon: SPORT_ICONS[s.slug as SportSlug] }))}
	{value}
	onchoose={choose}
	labelledby="{id}-label"
	{size}
>
	{#snippet face(option)}
		{@const index = sports.findIndex((s) => s.slug === option.slug)}
		{@const phrase = (shift: number) =>
			sports[(index + shift + sports.length) % sports.length].phrase.replaceAll(' ', ' ')}
		<!-- Барабан: все спорты на гранях кольца, текущий -- на передней, соседние бледные, дальние не
			видны. При прокрутке яркость каждой грани плавно меняется вместе с поворотом. Текст граней --
			из data-атрибута псевдоэлементом: чистая декорация, без текста в дереве доступности. Размер
			кнопке задаёт невидимая фраза текущего спорта -->
		<span class="sswitch__drum" class:sswitch__drum--page={!onchoose} aria-hidden="true" {@attach fit}
			><span class="sswitch__size">{phrase(0)}</span><span class="sswitch__nudge"
				>{#key option.slug}<span
						class="sswitch__reel"
						class:sswitch__reel--roll={roll}
						data-roll={roll || undefined}
						>{#each shifts as shift (shift)}<span
								class="sswitch__face sswitch__face--{level(shift)}"
								data-shift={shift}
								data-from={roll ? level(shift + roll) : undefined}
								data-text={phrase(shift)}
							></span>{/each}</span
					>{/key}</span
			></span
		><span class="sswitch__label">{option.title}</span>
	{/snippet}
</PopupSelect>

<style>
	/* Подпись и название спорта -- для скринридера, на экране их роль играет фраза */
	.sswitch__label {
		position: absolute;
		overflow: hidden;
		width: 1px;
		height: 1px;
		white-space: nowrap;
		clip-path: inset(50%);
	}

	/* Барабан -- цилиндр с осью за фразой. Без перспективы: буквы не косятся, поворот только
	   сдвигает и сжимает грани. Качается обёртка, к спорту проворачивается сам барабан: раздельно,
	   чтобы включённое снова покачивание не переигрывало прокрутку */
	.sswitch__drum {
		--reel-r: 0.95em;
		--reel-a: 50deg;
		--roll-time: 1s;
		--roll-ease: cubic-bezier(0.65, 0, 0.35, 1);

		position: relative;
		display: inline-block;
		white-space: nowrap;

		/* Отдельная страница статьи: при смене спорта фразу ведёт переход между страницами
		   (styles/global.css). На главной имени нет: там барабан крутится на месте */
		&--page {
			view-transition-name: sport-drum;
		}

		&--fitted {
			transition: width var(--roll-time) var(--roll-ease);

			@media (prefers-reduced-motion: reduce) {
				transition: none;
			}
		}
	}

	/* inline-block: у строчного элемента нет своего бокса, ResizeObserver его не видит */
	.sswitch__size {
		display: inline-block;
		visibility: hidden;
	}

	.sswitch__nudge,
	.sswitch__reel {
		position: absolute;
		top: 0;
		left: 0;
		transform-origin: 0 50% calc(-1 * var(--reel-r));
		transform-style: preserve-3d;
		width: 100%;
		height: 100%;
	}

	.sswitch__nudge {
		animation: sswitch-nudge 4s ease-in-out 3s infinite;

		@media (prefers-reduced-motion: reduce) {
			animation: none;
		}
	}

	/* Под курсором и с открытым списком барабан не качается: не отвлекает от выбора */
	:global(.pselect__button:is(:hover, [aria-expanded='true'])) .sswitch__nudge {
		animation: none;
	}

	.sswitch__face {
		pointer-events: none;
		position: absolute;
		top: 0;
		left: 0;
		transform-origin: 0 50% calc(-1 * var(--reel-r));
		transform: rotateX(calc(var(--shift) * -1 * var(--reel-a)));
		white-space: nowrap;
		/* Грань за осью барабана не просвечивает зеркальным текстом */
		backface-visibility: hidden;

		opacity: var(--to);

		&::before {
			content: attr(data-text);
		}

		&[data-shift='-3'] {
			--shift: -3;
		}

		&[data-shift='-2'] {
			--shift: -2;
		}

		&[data-shift='-1'] {
			--shift: -1;
		}

		&[data-shift='0'] {
			--shift: 0;
		}

		&[data-shift='1'] {
			--shift: 1;
		}

		&[data-shift='2'] {
			--shift: 2;
		}

		&[data-shift='3'] {
			--shift: 3;
		}

		/* Яркость: --to -- на месте, --from -- там, где грань стояла до прокрутки */
		&--full {
			--to: 1;
		}

		&--dim {
			--to: 0.15;
		}

		&--none {
			--to: 0;
		}

		&[data-from='full'] {
			--from: 1;
		}

		&[data-from='dim'] {
			--from: 0.15;
		}

		&[data-from='none'] {
			--from: 0;
		}
	}

	.sswitch__reel--roll .sswitch__face {
		animation: sswitch-fade var(--roll-time) var(--roll-ease) 0.05s both;
	}

	/* Барабан проворачивается к спорту на столько граней, сколько между ними по кольцу: при первом
	   показе и после выбора в списке. Разгон к середине и торможение, как у настоящего барабана */
	.sswitch__reel--roll {
		animation: sswitch-roll var(--roll-time) var(--roll-ease) 0.05s both;
	}

	.sswitch__reel[data-roll='-3'] {
		--roll: -3;
	}

	.sswitch__reel[data-roll='-2'] {
		--roll: -2;
	}

	.sswitch__reel[data-roll='-1'] {
		--roll: -1;
	}

	.sswitch__reel[data-roll='1'] {
		--roll: 1;
	}

	.sswitch__reel[data-roll='2'] {
		--roll: 2;
	}

	.sswitch__reel[data-roll='3'] {
		--roll: 3;
	}

	/* Покачивание раз в 4 секунды: сам качок -- последние 0,8 секунды цикла */
	@keyframes sswitch-nudge {
		0%,
		80%,
		100% {
			transform: rotateX(0);
		}

		87% {
			transform: rotateX(-8deg);
		}

		94% {
			transform: rotateX(3deg);
		}
	}

	@keyframes sswitch-fade {
		from {
			opacity: var(--from);
		}

		to {
			opacity: var(--to);
		}
	}

	/* Старт: новый спорт там, откуда приходит, -- на столько граней ниже (плюс) или выше (минус) */
	@keyframes sswitch-roll {
		from {
			transform: rotateX(calc(var(--roll) * -1 * var(--reel-a)));
		}

		to {
			transform: rotateX(0);
		}
	}
</style>
