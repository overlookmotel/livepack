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
	{isObject, isBoolean} = require('is-it-type');

// Imports
const plugin = require('./babel.js'),
	{isInternalPath, parseSourceMapFromCode} = require('./shared.js'),
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

function register(options) {
	// Conform options
	if (options == null) {
		options = {};
	} else {
		assert(isObject(options), 'options must be an object if provided');
	}

	const {esm} = options;
	assert(esm == null || isBoolean(esm), 'options.esm must be a boolean if provided');

	// Run Babel register
	babelRegister({
		ignore: [],
		root: pathParse(__dirname).root,
		sourceType: esm ? 'module' : 'script',
		plugins: [
			// Convert ESM to CJS if `esm` option set
			...(esm ? ['@babel/plugin-transform-modules-commonjs'] : []),
			[plugin, options]
		],
		generatorOpts: {retainLines: true, compact: false}
	});

	// Add pirates hook to capture code post-babel
	if (piratesRevert) piratesRevert();
	piratesRevert = addHook((code, filename) => {
		transpiledFiles[filename] = parseSourceMapFromCode(code);
		return code;
	}, {ignoreNodeModules: false});
}

register.revert = function revert() {
	babelRegister.revert();
	if (piratesRevert) piratesRevert();
};
