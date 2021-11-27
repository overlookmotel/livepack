/* --------------------
 * livepack module
 * Create loader.
 *
 * Transform all files loaded with Babel to insert tracking code.
 * Both code loaded with `require()` and `import` / `import()` is transformed.
 *
 * Using `@babel/register` to take advantage of its caching.
 * Babel register is prevented from registering its own pirates hook and instead the hook
 * it tries to create is captured. Livepack then creates its own pirates hook.
 * This allows a fast path for Livepack's internal code to completely avoid transpilation.
 * Livepack uses a separate internal module cache for its own code.
 * ------------------*/

/* eslint-disable import/order, import/newline-after-import, import/no-dynamic-require */

'use strict';

// Use internal module cache
const {
	useInternalModuleCache, usingInternalModuleCache, exposeModule, exposeModules, deleteInternalModule
} = require('./shared/moduleCache.js');
const revertModuleCache = useInternalModuleCache();

// Catalog globals etc
require('./init/index.js');

// Modules
const {createRequire} = require('module'),
	{fileURLToPath} = require('url'),
	pirates = require('pirates'),
	{addHook} = pirates,
	pluginTransformJsx = require('@babel/plugin-transform-react-jsx').default,
	assert = require('simple-invariant'),
	{isObject, isBoolean, isFullString, isFunction} = require('is-it-type');

// Load Babel register internals directly.
// This makes Babel register share the internal module cache created above.
// Load two different instances for ESM and CommonJS so they have separate internal state.
const babelRegisterPath = require.resolve('@babel/register/lib/node.js');
const babelRegisterEsm = require(babelRegisterPath).default;
deleteInternalModule(babelRegisterPath);
const babelRegisterCjs = require(babelRegisterPath).default;

const babelCache = require('@babel/register/lib/cache.js'),
	babelCacheLoad = babelCache.load;

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
const sourceMapSupportPath = createRequire(require.resolve('@babel/register'))
	.resolve('source-map-support');
exposeModule(sourceMapSupportPath);
const sourceMapSupport = require(sourceMapSupportPath);

// Constants
const COMMONJS_EXTS = ['.js', '.cjs'],
	TRANSFORMED_COMMENT_STR = `/*${TRANSFORMED_COMMENT}*/`,
	DEBUG = !!process.env.LIVEPACK_DEBUG_BABEL;

// Exports

module.exports = {createLoaderFromUrl, createLoader, urlToOptions};

let revert,
	sourceMapSupportInstalled = false;

/**
 * Create loader from URL.
 * Loader can have options specified as JSON in query.
 * e.g. `node --experimental-loader 'livepack/loader?{"jsx":true}' input.js`
 * The CLI also passes loader options to the loader via query.
 * @param {string} url - URL
 * @returns {Object} - Loader object
 * @throws {Error} - If URL query is not valid
 */
function createLoaderFromUrl(url) {
	return createLoader(urlToOptions(url));
}

/**
 * Create loader to transform files which are `require()`-ed or `import`-ed.
 * Use `@babel/register` to transform code with Livepack's Babel plugin
 * and register a `pirates` hook to capture code + source map from Babel.
 * These are used in `serialize()` with `sourceMaps: true` option
 * to produce source maps.
 *
 * CommonJS transform hook is applied immediately.
 * Returns a NodeJS ESM loader which user can pass to NodeJS themselves.
 *
 * @param {Object} [options] - Options object
 * @param {boolean|string} [options.configFile=false] - If set, passed to Babel
 * @param {boolean} [options.babelrc] - If true, uses `.babelrc`
 *   (defaults to true if `configFile` option set, otherwise false)
 * @param {boolean} [options.jsx=false] - If `true`, adds Babel plugin to transform JSX
 * @param {boolean} [options.cache=true] - If `false`, disables Babel register's cache
 * @param {Function} [options.shouldIgnorePath] - Function called with path,
 *   should return `true` to skip loader transforming
 * @returns {Object} - Loader object (currently only has `.transformSource()` method)
 */
function createLoader(options) {
	// Conform options
	options = conformOptions(options);

	// Revert previous CommonJS hook
	if (revert) {
		revert();
		revert = undefined;
	}

	// Capture Babel register's transform hook for ESM transform
	const transformEsm = getTransformFunction(babelRegisterEsm, true, options);

	// Capture Babel register's transform hook for CommonJS transform.
	// Ensure shares same cache with ESM hook (prevent cache being loaded twice).
	babelCache.load = () => {};
	const transformCjs = getTransformFunction(babelRegisterCjs, false, options);
	babelCache.load = babelCacheLoad;

	// Create pirates hook for CommonJS
	revert = pirates.addHook(transformCjs, {ignoreNodeModules: false, exts: COMMONJS_EXTS});

	// Return ESM loader
	return {
		getFormat: options.jsx
			? async (url, context, defaultGetFormat) => (
				/\.jsx$/.test(fileURLToPath(url))
					? {format: 'module'}
					: defaultGetFormat(url, context, defaultGetFormat)
			)
			: undefined,
		transformSource: async (code, context, defaultTransformSource) => (
			context.format === 'module'
				? {source: transformEsm(code, fileURLToPath(context.url))}
				: defaultTransformSource(code, context, defaultTransformSource)
		)
	};
}

/**
 * Conform options.
 * @param {Object|undefined|null} options - Options
 * @returns {Object} - Conformed options object
 * @throws {Error} - If options invalid
 */
function conformOptions(options) {
	// Conform options
	if (options == null) {
		options = {};
	} else {
		assert(isObject(options), 'options must be an object if provided');
		options = {...options};
	}

	const configFile = conformOption(
		'configFile', v => isBoolean(v) || isFullString(v), 'boolean or string', false
	);
	conformBooleanOption('babelrc', !!configFile);
	conformBooleanOption('jsx', false);
	conformBooleanOption('cache', true);

	conformOption('shouldIgnorePath', isFunction, 'function', undefined);

	return options;

	function conformOption(name, validate, requiredType, defaultValue) {
		let value = options[name];
		if (value == null) {
			value = options[name] = defaultValue;
		} else {
			assert(validate(value), `options.${name} must be a ${requiredType} if provided`);
		}
		return value;
	}

	function conformBooleanOption(name, defaultValue) {
		return conformOption(name, isBoolean, 'boolean', defaultValue);
	}
}

/**
 * Parse options from loader URL.
 * Loader can have options specified as JSON in query.
 * e.g. `node --experimental-loader 'livepack/loader?{"jsx":true}' input.js`
 * The CLI also passes loader options to the loader via query.
 * @param {string} url - URL
 * @returns {Object} - Options object
 * @throws {Error} - If URL query is not valid
 */
function urlToOptions(url) {
	let {search} = new URL(url);
	if (!search) return {};

	try {
		search = search.slice(1);
		search = decodeURIComponent(search);
		return JSON.parse(search);
	} catch (e) {
		throw new Error(`Cannot parse loader query as JSON: ${search}`);
	}
}

/**
 * Create transform function using Babel register.
 * @param {Function} babelRegister - Babel register function
 * @param {boolean} isEsm - `true` if ESM, `false` if CommonJS
 * @param {Object} options - Options object
 * @returns {undefined}
 */
function getTransformFunction(babelRegister, isEsm, options) {
	// Run Babel register and capture the pirates hook it creates
	let babelTransform;
	pirates.addHook = (hookFn) => {
		babelTransform = hookFn;
		return () => {};
	};

	try {
		babelRegister({
			ignore: [],
			configFile: options.options,
			babelrc: options.babelrc,
			sourceType: isEsm ? 'module' : 'script',
			plugins: [
				...(options.jsx ? [pluginTransformJsx] : []), // Transform JSX if `jsx` option set
				plugin
			],
			caller: {
				name: 'livepack/loader',
				version: livepackVersion
			},
			generatorOpts: {retainLines: !DEBUG, compact: false},
			cache: options.cache
		});

		assertBug(isFunction(babelTransform), "Failed to capture Babel register's transform hook");
	} finally {
		pirates.addHook = addHook;
	}

	// Patch Babel's `retrieveSourceMap()` handler to convert `file:///` URLs to file paths.
	// Temporarily shim `babelTransform()`.
	// When first file is transformed, `@babel/register` will install source map support.
	// Babel calls `sourceMapSupport.install()` with a `retrieveSourceMap()` method which
	// retrieves source map from its map cache.
	// Problem is that `retrieveSourceMap()` will be called with a `file:///` URL for ESM file,
	// whereas Babel uses file paths for the map cache.
	// So temporarily monkey-patch `sourceMapSupport.install()` to intercept Babel's `retrieveSourceMap()`
	// and patch it to convert file URLs to file paths.
	if (isEsm && !sourceMapSupportInstalled) {
		const babelTransformOrig = babelTransform;
		babelTransform = (code, filename) => {
			const {install} = sourceMapSupport;
			sourceMapSupport.install = (installOptions) => {
				const {retrieveSourceMap} = installOptions;
				install({
					...installOptions,
					retrieveSourceMap(filename) { // eslint-disable-line no-shadow
						return retrieveSourceMap(
							filename.startsWith('file:///') ? fileURLToPath(filename) : filename
						);
					}
				});
				sourceMapSupportInstalled = true;
			};

			let codeTransformed;
			try {
				codeTransformed = babelTransformOrig(code, filename);
			} finally {
				sourceMapSupport.install = install;
			}

			assertBug(
				sourceMapSupportInstalled, "Failed to patch Babel register's retrieveSourceMap function"
			);

			babelTransform = babelTransformOrig;

			return codeTransformed;
		};
	}

	// Return transform function which transforms code with Babel and records transpiled code
	const shouldIgnorePath = options.shouldIgnorePath || (() => false);
	return (code, filename) => {
		// Skip transform if this is an internal module or `shouldIgnorePath` option requests skip
		if (usingInternalModuleCache() || shouldIgnorePath(filename)) return code;

		// Transform with Babel
		const codeTransformed = babelTransform(code, filename);

		if (DEBUG) {
			/* eslint-disable no-console */
			console.log('----------------------------------------');
			console.log('TRANSFORMED:', filename);
			console.log('----------------------------------------');
			console.log(codeTransformed);
			console.log('');
			/* eslint-enable no-console */
		}

		let isTransformed = codeTransformed.startsWith(TRANSFORMED_COMMENT_STR);
		if (!isTransformed) {
			const hashBang = codeTransformed.match(/^#![^\n]+[\r\n]+/);
			if (hashBang && codeTransformed.slice(hashBang[0].length).startsWith(TRANSFORMED_COMMENT_STR)) {
				isTransformed = true;
			}
		}
		assertBug(isTransformed, `Babel transform failed on ${filename}`);

		// Record transpiled code in `transpiledFiles` (used in `serialize()` for creating source maps).
		transpiledFiles[filename] = parseSourceMapFromCode(codeTransformed);

		return codeTransformed;
	};
}
