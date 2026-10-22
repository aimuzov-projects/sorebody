import type { FullConfig, Reporter, Suite, TestCase, TestRun } from '@playwright/test/reporter'

/**
 * Свой `--shard` вместо встроенного. Встроенный режет список тестов подряд, и восемь частей обхода
 * sitemap из site.spec.ts, которые идут друг за другом и занимают почти три четверти времени,
 * попадали бы в один-два шарда. Здесь тесты раздаются по кругу, а тесты одного объявления
 * (части sitemap из цикла) -- подряд, так каждому шарду достаётся поровну частей каждого вида.
 *
 * Состав прогона в каждом шарде один и тот же, поэтому шарды делят его без пересечений.
 * Тесты файла с `mode: 'default'` могут уйти в разные шарды: это разные машины, а по очереди
 * их гоняют, чтобы не делить одну
 */
export default class ShardReporter implements Reporter {
	async preprocess({ config, suite, testRun }: { config: FullConfig; suite: Suite; testRun: TestRun }) {
		const { shard } = config

		if (!shard) return

		testRun.skipSharding()

		const byDeclaration = Map.groupBy(suite.allTests(), declaration)
		let index = 0

		for (const tests of byDeclaration.values()) {
			for (const test of tests) {
				if (index++ % shard.total !== shard.current - 1) testRun.exclude(test)
			}
		}
	}

	printsToStdio() {
		return false
	}
}

const declaration = ({ location }: TestCase) => `${location.file}:${location.line}:${location.column}`
