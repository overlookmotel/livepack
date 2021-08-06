/* --------------------
 * livepack module
 * Init tracking.
 * Use `@babel/register` to transform all files loaded with `require()` to insert tracking code.
 * ------------------*/

/* eslint-disable import/order, import/newline-after-import */

'use strict';

// Use internal module cache
const {
	useInternalModuleCache, usingInternalModuleCache, exposeModule, exposeModules, Module
} = require('./shared/moduleCache.js');
const revertModuleCache = useInternalModuleCache();

// Catalog globals etc
require('./init/index.js');

// Modules
const {readFileSync} = require('fs'),
	{addHook} = require('pirates'),
	pluginModulesToCommonJs = require('@babel/plugin-transform-modules-commonjs').default,
	pluginTransformJsx = require('@babel/plugin-transform-react-jsx').default,
	pluginDynamicImportToRequire = require('babel-plugin-dynamic-import-node'),
	assert = require('simple-invariant'),
	{isObject, isBoolean, isFullString} = require('is-it-type');

// Load Babel register internal directly.
// This makes Babel register share the internal module cache created above.
const {default: babelRegister, revert: babelRevert} = require('@babel/register/lib/node.js');

// Imports
const plugin = require('./babel/index.js'),
	{isInternalPath, parseSourceMapFromCode} = require('./shared/functions.js'),
	{TRANSFORMED_COMMENT} = require('./shared/constants.js'),
	assertBug = require('./shared/assertBug.js'),
	{transpiledFiles} = require('./shared/internal.js'),
	livepackVersion = require('../package.json').version;

// Load Livepack module public entry point and `init/eval` so they, and all modules/packages
// required by them, don't get transpiled when Livepack is loaded later in user code.
require('../index.js');
require('./init/eval.js');

// Switch back to global module cache
revertModuleCache();

// Expose Livepack's internal modules in global module cache
exposeModules(isInternalPath);

// Add `source-map-support` to global cache as it's stateful
const sourceMapSupportPath = resolveFrom('source-map-support', require.resolve('@babel/register'));
exposeModule(sourceMapSupportPath);

// Constants
const EXTS = ['.es6', '.es', '.jsx', '.js', '.cjs', '.mjs'], // `@babel/register`'s defaults + `.cjs`
	TRANSFORMED_COMMENT_STR = `/*${TRANSFORMED_COMMENT}*/`,
	DEBUG = !!process.env.LIVEPACK_DEBUG_BABEL;

// Exports

module.exports = register;
register.revert = revert;

// Run `register()` with default options
let reverter = null;
register();

/**
 * Transform files which are `require()`-ed.
 * Use `@babel/register` to transform code with Livepack's Babel plugin
 * and register a `pirates` hook to capture code + source map from Babel.
 * These are used in `serialize()` with `sourceMaps: true` option
 * to produce source maps.
 * @param {Object} [options] - Options object
 * @param {boolean|string} [options.configFile=false] - If set, passed to Babel
 * @param {boolean} [options.babelrc] - If true, uses `.babelrc`
 *   (defaults to true if `configFile` option set, otherwise false)
 * @param {boolean} [options.esm=false] - If `true`, adds Babel plugin to transform ESM to CJS
 * @param {boolean} [options.jsx=false] - If `true`, adds Babel plugin to transform JSX
 * @param {boolean} [options.cache=true] - If `false`, disables Babel register's cache
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

	// Revert previous hooks
	revert();

	// Patch loader for ESM
	const patchLoaderRevert = esm ? patchLoader() : null;

	// Init Babel register
	babelRegister({
		ignore: [],
		configFile,
		babelrc,
		sourceType: esm ? 'module' : 'script',
		plugins: [
			// Transform JSX if `jsx` option set
			...(jsx ? [pluginTransformJsx] : []),
			// Convert ESM to CJS if `esm` option set
			...(esm ? [pluginModulesToCommonJs, pluginDynamicImportToRequire] : []),
			plugin
		],
		caller: {
			name: 'livepack/register',
			version: livepackVersion
		},
		extensions: EXTS,
		generatorOpts: {retainLines: !DEBUG, compact: false},
		cache: useCache
	});

	// Add pirates hook to capture code post-babel
	const piratesRevert = addHook((code, filename) => {
		// Record transpiled code in `transpiledFiles` (used in `serialize()` for creating source maps).
		// Ignore files which Babel uses internally, which are not transformed and loaded into
		// internal module cache.
		if (!usingInternalModuleCache()) {
			if (DEBUG) {
				/* eslint-disable no-console */
				console.log('----------------------------------------');
				console.log('TRANSFORMED:', filename);
				console.log('----------------------------------------');
				console.log(code);
				console.log('');
				/* eslint-enable no-console */
			}

			let isTransformed = code.startsWith(TRANSFORMED_COMMENT_STR);
			if (!isTransformed) {
				const hashBang = code.match(/^#![^\n]+[\r\n]+/);
				if (hashBang && code.slice(hashBang[0].length).startsWith(TRANSFORMED_COMMENT_STR)) {
					isTransformed = true;
				}
			}
			assertBug(isTransformed, `Babel transform failed on ${filename}`);

			transpiledFiles[filename] = parseSourceMapFromCode(code);
		}

		return code;
	}, {
		ignoreNodeModules: false,
		exts: EXTS
	});

	// Store function to revert hooks
	reverter = () => {
		// Revert hooks in reverse order
		piratesRevert();
		babelRevert();
		if (patchLoaderRevert) patchLoaderRevert();
	};
}

/*
 * Patch `Module._extensions['.js']` to allow loading ESM from dir
 * with `package.json` including `{"type": "module"}`.
 * Node's original contains logic to throw error if file is identified as ESM.
 * https://github.com/nodejs/node/blob/3153c2d3833a8a46d92fde33d2773e63ef21357b/lib/internal/modules/cjs/loader.js#L1095
 */
function patchLoader() {
	const extensions = Module._extensions;
	const oldLoader = extensions['.js'];

	const newLoader = function(module, filename) {
		try {
			oldLoader.call(this, module, filename); // eslint-disable-line no-invalid-this
		} catch (err) {
			if (err.code !== 'ERR_REQUIRE_ESM') throw err;

			// Identical logic as Node's loader, but without `package.json` check
			const content = readFileSync(filename, 'utf8');
			module._compile(content, filename);
		}
	};
	extensions['.js'] = newLoader;

	// Return function to revert patch
	return () => {
		assert(
			extensions['.js'] === newLoader,
			'Loader has been patched. Revert patch before calling `revert()`.'
		);
		extensions['.js'] = oldLoader;
	};
}

/**
 * Revert register - all hooks
 * @returns {undefined}
 */
function revert() {
	if (!reverter) return;
	reverter();
	reverter = null;
}

/*
 * Utils
 */

function resolveFrom(specifier, fromPath) {
	// TODO Remove `createRequireFromPath` fallback once support for Node < v12.2.0 is dropped
	const createRequire = Module.createRequire || Module.createRequireFromPath;
	return createRequire(fromPath).resolve(specifier);
}
