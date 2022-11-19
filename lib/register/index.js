/* --------------------
 * livepack module
 * Init tracking.
 * Instrument all files loaded with `require()` to insert tracking code.
 * ------------------*/

/* eslint-disable import/order, import/newline-after-import */

'use strict';

// Use internal module cache
const {
	useInternalModuleCache, usingInternalModuleCache, exposeModule, Module
} = require('../shared/moduleCache.js');
const revertModuleCache = useInternalModuleCache();

// Catalog globals etc
require('../init/index.js');

// Modules
const {readFileSync, statSync} = require('fs'),
	pathJoin = require('path').join,
	{addHook} = require('pirates'),
	installSourceMapSupport = require('source-map-support').install,
	EXTS = require('@babel/core').DEFAULT_EXTENSIONS,
	assert = require('simple-invariant'),
	{isObject, isBoolean} = require('is-it-type');

// Imports
const {instrumentCodeImpl} = require('../instrument/instrument.js'),
	{openCache, closeCache} = require('./cache.js');

// Load Livepack module public entry point so it, and all modules/packages
// required by it, don't get transpiled when Livepack is loaded later in user code.
require('../../index.js');

// Switch back to global module cache
revertModuleCache();

// Expose Livepack's public exports in global module cache
const exposePaths = [
	'../../index.js',
	'../init/index.js'
];
for (const path of exposePaths) {
	exposeModule(pathJoin(__dirname, path));
}

// Add `source-map-support` to global cache as it's stateful
exposeModule(require.resolve('source-map-support'));

// Constants
const DEBUG = !!process.env.LIVEPACK_DEBUG_INSTRUMENT;

// Exports

module.exports = register;
register.revert = revert;

// Run `register()` with default options
let reverter;
register();

const maps = Object.create(null);

/**
 * Transform files which are `require()`-ed.
 * @param {Object} [options] - Options object
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

	const esm = conformBoolOption(options, 'esm', false),
		jsx = conformBoolOption(options, 'jsx', false),
		useCache = conformBoolOption(options, 'cache', true);

	// Revert previous hooks
	revertWithoutCacheClose();

	// Get cache
	let cache;
	if (useCache) {
		cache = openCache();
	} else {
		closeCache();
	}

	// Patch loader for ESM
	const patchLoaderRevert = esm ? patchLoader() : null;

	// Add pirates hook to transform code
	const piratesRevert = addHook((code, filename) => {
		// Skip if this file is `require`-ed during process of instrumenting code
		if (usingInternalModuleCache()) return code;

		// Get from cache
		let cacheKey, lastMod, cached;
		if (cache) {
			cacheKey = cache.getKey(filename, esm, jsx);
			lastMod = +statSync(filename).mtime;
			cached = cache.get(cacheKey, lastMod);
		}

		let map;
		if (cached) {
			({code, map} = cached);
		} else {
			// Instrument code. Perform this internal module cache so any files `require`-ed by Livepack
			// or Babel are not themselves instrumented.
			useInternalModuleCache();
			({code, map} = instrumentCodeImpl(code, filename, esm, !esm, jsx, esm, true, undefined, !DEBUG));
			revertModuleCache();

			if (DEBUG) {
				/* eslint-disable no-console */
				console.log('----------------------------------------');
				console.log('TRANSFORMED:', filename);
				console.log('----------------------------------------');
				console.log(code);
				console.log('');
				/* eslint-enable no-console */
			}

			// Save result to cache
			if (cache) cache.save(cacheKey, lastMod, code, map);
		}

		// Record source map with `source-map-support`
		maps[filename] = map;
		initSourceMapSupport();

		// Return transformed code
		return code;
	}, {
		ignoreNodeModules: false,
		exts: EXTS
	});

	// Store function to revert hooks
	reverter = () => {
		piratesRevert();
		if (patchLoaderRevert) patchLoaderRevert();
	};
}

/**
 * Conform an option to boolean.
 * @param {Object} options - Options object
 * @param {string} optionName - Option name
 * @param {boolean} defaultValue - Default value if provided option is `null` or `undefined`
 * @returns {boolean} - Option value
 */
function conformBoolOption(options, optionName, defaultValue) {
	const value = options[optionName];
	if (value == null) return defaultValue;
	assert(isBoolean(value), `options.${optionName} must be a boolean if provided`);
	return value;
}

/**
 * Patch `Module._extensions['.js']` to allow loading ESM from dir
 * with `package.json` including `{"type": "module"}`.
 * Node's original contains logic to throw error if file is identified as ESM.
 * https://github.com/nodejs/node/blob/3153c2d3833a8a46d92fde33d2773e63ef21357b/lib/internal/modules/cjs/loader.js#L1095
 * @returns {Function} - Function to revert patch
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
 * Initialize `source-map-support`.
 * No-op if called more than once.
 * @returns {undefined}
 */
function initSourceMapSupport() {
	initSourceMapSupport = () => {}; // eslint-disable-line no-func-assign

	installSourceMapSupport({
		handleUncaughtExceptions: false,
		environment: 'node',
		retrieveSourceMap(filename) {
			const map = maps[filename];
			if (map) return {url: null, map};
			return null;
		}
	});
}

/**
 * Revert register hooks and close cache.
 * @returns {undefined}
 */
function revert() {
	closeCache();
	revertWithoutCacheClose();
}

/**
 * Revert register hooks, but don't close cache.
 * @returns {undefined}
 */
function revertWithoutCacheClose() {
	if (!reverter) return;
	reverter();
	reverter = undefined;
}
