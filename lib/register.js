/* --------------------
 * livepack module
 * Babel register tracking
 * ------------------*/

'use strict';

// Modules
const pathParse = require('path').parse,
	babelRegister = require('@babel/register');

// Imports
const plugin = require('./babel.js');

// Exports

module.exports = function register(pluginOptions) {
	babelRegister({
		ignore: [],
		root: pathParse(__dirname).root,
		plugins: [
			[plugin, pluginOptions]
		],
		generatorOpts: {retainLines: true, compact: false}
	});
};
