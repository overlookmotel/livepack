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

	// Run Babel register
	babelRegister({
		ignore: [],
		root: pathParse(__dirname).root,
		plugins: [
			[plugin, options]
		],
		generatorOpts: {retainLines: true, compact: false}
	});
};
