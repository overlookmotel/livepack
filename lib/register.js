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
	babelRegister = require('@babel/register'),
	{isObject, isBoolean} = require('is-it-type');

// Imports
const plugin = require('./babel.js'),
	{isInternalPath} = require('./shared.js');

// Clear require cache, so modules used up to this point get reloaded
// and babel-transformed when loaded from user code.
// e.g. `require('is-it-type')`
// Internal files (in `lib/`) are left alone as they are not babel-transformed.
const {cache} = require;
for (const path of Object.keys(cache)) {
	if (isInternalPath(path)) continue;
	delete cache[path];
}

// Exports

module.exports = function register(options) {
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
};
