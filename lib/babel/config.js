/* --------------------
 * livepack module
 * Babel plugin config
 * ------------------*/

'use strict';

// Modules
const {extname} = require('path'),
	pluginModulesToCommonJs = require('@babel/plugin-transform-modules-commonjs').default,
	pluginTransformJsx = require('@babel/plugin-transform-react-jsx').default,
	pluginDynamicImportToRequire = require('babel-plugin-dynamic-import-node'),
	getPackageType = require('get-package-type').sync,
	assert = require('simple-invariant');

// Imports
const plugin = require('./index.js');

// Constants
const PACKAGE_JSON_TYPES = ['commonjs', 'module'],
	EXT_TYPES = {
		'.cjs': 'commonjs',
		'.mjs': 'module',
		'.js': 'ambiguous'
	};

// Exports

module.exports = {
	createBabelConfig,
	EXT_TYPES
};

/**
 * Create Babel config.
 * @param {Object} options - Options object
 * @param {boolean} options.configFile - If true, uses Babel config files
 * @param {boolean} options.babelrc - If true, uses `.babelrc`
 * @param {boolean} options.jsx - If true, does JSX transform
 * @param {Object} options.extTypes - Object mapping file extension to file type
 *   ('commonjs' / 'module' / 'ambiguous')
 * @returns {Object} - Babel config object
 */
function createBabelConfig({configFile, babelrc, jsx, extTypes}) {
	return {
		ignore: [],
		configFile,
		babelrc,
		sourceType: 'script',
		overrides: [{
			test: path => fileIsEsm(path, extTypes),
			sourceType: 'module'
		}],
		plugins: [
			// Transform JSX if `jsx` option set
			...(jsx ? [pluginTransformJsx] : []),
			// Transform ESM to CJS
			[pluginModulesToCommonJs, {allowCommonJSExports: false}],
			pluginDynamicImportToRequire,
			// Livepack Babel plugin
			plugin
		],
		generatorOpts: {retainLines: true, compact: false}
	};
}

/**
 * Determine from file extension / `package.json` `type` field if file should be treated as ES module.
 * @param {string} path - File path
 * @param {Object} extTypes - Object mapping file extension to file type
 *   ('commonjs' / 'module' / 'ambiguous')
 * @returns {boolean} - `true` if file should be treated as ES module
 */
function fileIsEsm(path, extTypes) {
	// Get type from file extension
	const ext = extname(path).toLowerCase();
	let type = extTypes[ext];

	// If ambiguous file extension (.js), determine type from `package.json` `type` field
	if (type === 'ambiguous') {
		type = getPackageType(path);
		assert(
			PACKAGE_JSON_TYPES.includes(type),
			`Unexpected 'type' field value '${type}' in package.json above '${path}'`
		);
	}

	return type === 'module';
}
