/* --------------------
 * livepack module
 * Babel register tracking
 * ------------------*/

'use strict';

// Modules
const pathParse = require('path').parse,
	assert = require('assert'),
	babelRegister = require('@babel/register'),
	{isObject, isBoolean} = require('is-it-type');

// Imports
const plugin = require('./babel.js');

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
