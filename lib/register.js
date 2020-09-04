/* --------------------
 * livepack module
 * Init tracking.
 * Use `@babel/register` to transform all files loaded with `require()`
 * to insert tracking code.
 * ------------------*/

'use strict';

// Catalog globals etc
require('./init/index.js');

// Modules
const assert = require('assert'),
	babel = require('@babel/core'),
	babelRegister = require('@babel/register'),
	pluginModulesToCommonJs = require('@babel/plugin-transform-modules-commonjs').default,
	pluginTransformJsx = require('@babel/plugin-transform-react-jsx').default,
	{addHook} = require('pirates'),
	{isObject, isBoolean, isFullString} = require('is-it-type');

// Imports
const plugin = require('./babel.js'),
	{isInternalPath, parseSourceMapFromCode, TRANSFORMED_COMMENT} = require('./shared.js'),
	{transpiledFiles} = require('./internal.js');

// Warm up `@babel/core`.
// Babel lazy-loads several packages it uses internally. If this happens while `@babel/register`
// is trying to transpile that same module, it does not get transpiled and so the tracking
// code is not inserted.
// This "warm up" makes Babel preload these package internally, so they can then be transpiled later.
// Without this, Babel crashes when `convert-source-map` is required later by
// `lib/serialize/serializer.js`.
// https://github.com/babel/babel/issues/11964
// This warm-up also forces pre-loading of some other modules, for same reasons.
// Inclusion of `@babel/plugin-transform-modules-commonjs` is to pre-load `lodash` and `semver`.
Object.assign({}, babel); // eslint-disable-line prefer-object-spread

babel.transformSync('import {join} from "path"', {
	sourceMaps: 'inline',
	configFile: false,
	babelrc: false,
	plugins: [pluginModulesToCommonJs]
});

babel.File.prototype.availableHelper('typeof', '1.0.0');

// Clear require cache, so modules used up to this point get reloaded
// and babel-transformed when loaded from user code.
// e.g. `require('is-it-type')`
// Livepack's internal files (some files in `lib/`) are left alone as they are not Babel-transformed.
const {cache} = require;
for (const path of Object.keys(cache)) {
	if (isInternalPath(path)) continue;
	delete cache[path];
}

// Exports

module.exports = register;

// Run `register()` with default options
const TRANSFORMED_COMMENT_STR = `/*${TRANSFORMED_COMMENT}*/`;
let piratesRevert = null;

register();

// Load modules which otherwise get loaded internally in `@babel/register`
// and therefore avoid getting transpiled
require('convert-source-map');
require('source-map');

/**
 * Start transforming files which are `require()`-ed.
 * Use `@babel/register` to transform code with livepack's Babel plugin
 * and register a `pirates` hook to capture code + source map from Babel.
 * These are used in `serialize()` with `sourceMaps: true` option
 * to produce source maps.
 * Options are passed to Babel plugin.
 * @param {Object} [options] - Options object
 * @param {boolean|string} [option.configFile=false] - If set, passed to Babel
 * @param {boolean} [option.babelrc] - If true, uses `.babelrc`
 *   (defaults to true if `configFile` option set, otherwise false)
 * @param {boolean} [options.esm=false] - If `true`, adds Babel plugin to transform ESM to CJS
 * @param {boolean} [options.jsx=false] - If `true`, adds Babel plugin to transform JSX
 * @param {boolean} [options.cache=true] - If `false`, disables Babel register's cache
 * @param {string} [options.initPath] - Path to `init` script file
 * @returns {undefined}
 */
function register(options) {
	// Conform options
	if (options == null) {
		options = {};
	} else {
		assert(isObject(options), 'options must be an object if provided');
	}

	let {configFile, babelrc, esm, jsx, cache: useCache} = options; // eslint-disable-line prefer-const
	assert(
		configFile == null || isBoolean(configFile) || isFullString(configFile),
		'options.configFile must be a boolean or string if provided'
	);
	if (configFile == null) configFile = false;

	assert(babelrc == null || isBoolean(babelrc), 'options.babelrc must be a boolean if provided');
	if (babelrc == null) babelrc = !!configFile;

	assert(esm == null || isBoolean(esm), 'options.esm must be a boolean if provided');
	assert(jsx == null || isBoolean(jsx), 'options.jsx must be a boolean if provided');

	assert(useCache == null || isBoolean(useCache), 'options.cache must be a boolean if provided');
	if (useCache == null) useCache = true;

	// Run Babel register
	babelRegister({
		ignore: [],
		configFile,
		babelrc,
		sourceType: esm ? 'module' : 'script',
		plugins: [
			// Transform JSX if `jsx` option set
			...(jsx ? [pluginTransformJsx] : []),
			// Convert ESM to CJS if `esm` option set
			...(esm ? [pluginModulesToCommonJs] : []),
			[plugin, {initPath: options.initPath}]
		],
		generatorOpts: {retainLines: true, compact: false},
		cache: useCache
	});

	// Add pirates hook to capture code post-babel
	if (piratesRevert) piratesRevert();
	piratesRevert = addHook((code, filename) => {
		transpiledFiles[filename] = parseSourceMapFromCode(code);

		assert(
			isInternalPath(filename) || code.startsWith(TRANSFORMED_COMMENT_STR),
			`Babel transform failed on ${filename} due to internal use within Babel. Please raise an issue at https://github.com/overlookmotel/livepack/issues`
		);

		return code;
	}, {ignoreNodeModules: false});
}

/**
 * Revert register - both babel register + code-capture pirates hook.
 * @returns {undefined}
 */
register.revert = function revert() {
	babelRegister.revert();
	if (piratesRevert) piratesRevert();
};
