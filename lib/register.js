/* --------------------
 * livepack module
 * Init tracking.
 * Use `@babel/register` to transform all files loaded with `require()`
 * to insert tracking code.
 * ------------------*/

'use strict';

// Catalog globals etc
require('./init.js');

// Modules
const pathParse = require('path').parse,
	assert = require('assert'),
	{transformSync} = require('@babel/core'),
	babelRegister = require('@babel/register'),
	{addHook} = require('pirates'),
	{isObject, isFunction, isBoolean} = require('is-it-type');

// Imports
const plugin = require('./babel.js'),
	{
		isInternalPath, parseSourceMapFromCode,
		TRACKER_COMMENT_PREFIX, TEMP_COMMENT_PREFIX
	} = require('./shared.js'),
	{transpiledFiles} = require('./internal.js');

// Warm up `@babel/core`. This causes Babel to preload `convert-source-map` module internally.
// Without this, Babel crashes when `convert-source-map` is required later by
// `lib/serialize/serializer.js`, as Babel tries to require `convert-source-map` again itself
// while in the middle of transpiling it.
// https://github.com/babel/babel/issues/11964
transformSync('1', {sourceMaps: 'inline', configFile: false, babelrc: false});

// Clear require cache, so modules used up to this point get reloaded
// and babel-transformed when loaded from user code.
// e.g. `require('is-it-type')`
// Livepack's internal files (in `lib/`) are left alone as they are not Babel-transformed.
const {cache} = require;
for (const path of Object.keys(cache)) {
	if (isInternalPath(path)) continue;
	delete cache[path];
}

// Exports

module.exports = register;

// Run `register()` with default options
let piratesRevert = null;

register();

/**
 * Start transforming files which are `require()`-ed.
 * Use `@babel/register` to transform code with livepack's Babel plugin
 * and register a `pirates` hook to capture code + source map from Babel.
 * These are used in `serialize()` with `sourceMaps: true` option
 * to produce source maps.
 * Options are passed to Babel plugin.
 * @param {Object} [options] - Options object
 * @param {boolean} [options.esm=false] - If `true`, adds Babel plugin to transform ESM to CJS
 * @param {string} [options.trackerPath] - Path to `tracker` file
 * @param {string} [options.initPath] - Path to `init` script file
 * @param {Function} [options.shouldPrintComment] - If provided, function is called with text of
 *   every comment encountered in source. If function returns true, the comment is retained in output.
 * @returns {undefined}
 */
function register(options) {
	// Conform options
	if (options == null) {
		options = {};
	} else {
		assert(isObject(options), 'options must be an object if provided');
	}

	const {esm} = options;
	assert(esm == null || isBoolean(esm), 'options.esm must be a boolean if provided');

	const {shouldPrintComment} = options;
	assert(
		shouldPrintComment == null || isFunction(shouldPrintComment),
		'options.shouldPrintComment must be a function if provided'
	);

	// Run Babel register
	const pluginOptions = {
		trackerPath: options.trackerPath,
		initPath: options.initPath
	};

	babelRegister({
		ignore: [],
		root: pathParse(__dirname).root,
		sourceType: esm ? 'module' : 'script',
		plugins: [
			// Convert ESM to CJS if `esm` option set
			...(esm ? ['@babel/plugin-transform-modules-commonjs'] : []),
			[plugin, pluginOptions]
		],
		generatorOpts: {
			retainLines: true,
			compact: false,
			// Remove all comments except livepack's own and those specified to be kept
			// by `shouldPrintComment` option.
			// Sometimes comments cause errors in source maps (e.g. `function x() {} // foo`)
			// so comments are removed by default.
			shouldPrintComment(comment) {
				return comment.startsWith(TRACKER_COMMENT_PREFIX)
					|| comment.startsWith(TEMP_COMMENT_PREFIX)
					|| (shouldPrintComment && shouldPrintComment(comment));
			}
		},
		cache: false
	});

	// Add pirates hook to capture code post-babel
	if (piratesRevert) piratesRevert();
	piratesRevert = addHook((code, filename) => {
		transpiledFiles[filename] = parseSourceMapFromCode(code);
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
