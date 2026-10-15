import globalData from '@csstools/postcss-global-data'
import customMedia from 'postcss-custom-media'
import nested from 'postcss-nested'

export default {
	// `media.css` подмешивается в каждый блок стилей, иначе `postcss-custom-media`
	// не увидит брейкпоинты, объявленные в другом файле. В бандл сам файл не попадает.
	// NOTE: `globalData` должен стоять раньше `customMedia`.
	plugins: [globalData({ files: ['src/frontend/styles/media.css'] }), customMedia(), nested()],
}
