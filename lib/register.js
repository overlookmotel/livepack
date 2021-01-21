/* --------------------
 * livepack module
 * Init tracking.
 * Use `@babel/register` to transform all files loaded with `require()` to insert tracking code.
 * ------------------*/

/* eslint-disable import/order, import/newline-after-import */

'use strict';

// Use internal module cache
const {useInternalModuleCache, exposeModules, exposeModule, Module} = require('./shared/moduleCache.js');
const revertModuleCache = useInternalModuleCache();

// Catalog globals etc
require('./init/index.js');

// Patch pirates to capture `@babel/register`'s hook.
// This is a hack for until https://github.com/babel/babel/pull/12665 is included in a Babel release.
// TODO Remove this once Babel release includes this.
const pirates = require('pirates');

const piratesAddHook = pirates.addHook;

let hookCaptureEnabled = false,
	capturedHook = null;
pirates.addHook = function addHook(hook, opts) {
	if (hookCaptureEnabled) {
		capturedHook = hook;
		return function revert() {}; // eslint-disable-line no-shadow
	}

	return piratesAddHook(hook, opts);
};

function captureHook(fn) {
	hookCaptureEnabled = true;

	try {
		fn();
		return capturedHook;
	} finally {
		hookCaptureEnabled = false;
		capturedHook = null;
	}
}

// Modules
const {readFileSync} = require('fs'),
	pluginModulesToCommonJs = require('@babel/plugin-transform-modules-commonjs').default,
	pluginTransformJsx = require('@babel/plugin-transform-react-jsx').default,
	pluginDynamicImportToRequire = require('babel-plugin-dynamic-import-node'),
	assert = require('simple-invariant'),
	{isObject, isBoolean, isFullString} = require('is-it-type');

// Imports
const plugin = require('./babel/index.js'),
	{isInternalPath, parseSourceMapFromCode} = require('./shared/functions.js'),
	{TRANSFORMED_COMMENT} = require('./shared/constants.js'),
	{transpiledFiles} = require('./internal.js');

// Load Livepack module public entry point so it, and all modules/packages required by it,
// don't get transpiled when Livepack is loaded later in user code.
require('../index.js');

// Load Babel register (load last to avoid slowing down loading everything above)
const babelRegister = require('@babel/register');

// Switch back to global module cache
revertModuleCache();

// Expose Livepack's internal modules in global module cache
exposeModules(isInternalPath);

// Add `source-map-support` to global cache as it's stateful
const sourceMapSupportPath = resolveFrom('source-map-support', require.resolve('@babel/register'));
exposeModule(sourceMapSupportPath);

// Constants
const EXTS = ['.es6', '.es', '.jsx', '.js', '.cjs', '.mjs'], // `@babel/register`'s defaults + `.cjs`
	TRANSFORMED_COMMENT_STR = `/*${TRANSFORMED_COMMENT}*/`;

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
 * @param {boolean|string} [option.configFile=false] - If set, passed to Babel
 * @param {boolean} [option.babelrc] - If true, uses `.babelrc`
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

	// Capture hook from Babel register
	const babelHook = captureHook(() => {
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
			extensions: EXTS,
			generatorOpts: {retainLines: true, compact: false},
			cache: useCache
		});
	});

	// Add pirates hook to execute Babel register hook and capture code post-babel
	let compiling = false;
	const piratesRevert = piratesAddHook((code, filename) => {
		// Skip compiling modules loaded within Babel
		if (compiling) return code;

		// Run Babel hook in internal module context
		compiling = true;
		const revertModuleCache = useInternalModuleCache(); // eslint-disable-line no-shadow

		let babeledCode;
		try {
			babeledCode = babelHook(code, filename);
		} finally {
			compiling = false;
			revertModuleCache();
		}

		// Check code was transformed
		assert(
			isInternalPath(filename) || babeledCode.startsWith(TRANSFORMED_COMMENT_STR),
			`Babel transform failed on ${filename}.`
		);

		// Record transpiled code in `transpiledFiles` (used in `serialize()` for creating source maps)
		transpiledFiles[filename] = parseSourceMapFromCode(babeledCode);

		return babeledCode;
	}, {
		ignoreNodeModules: false,
		exts: EXTS
	});

	// Store function to revert hooks
	reverter = () => {
		piratesRevert();
		babelRegister.revert();
		if (patchLoaderRevert) patchLoaderRevert();
	};
}

/**
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
	const createRequire = Module.createRequire || Module.createRequireFromPath;
	return createRequire(fromPath).resolve(specifier);
}
