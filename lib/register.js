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

// Import rest of library to prevent it being loaded with babel
require('./tracker.js');
require('./index.js');

// Exports

module.exports = function register(pluginOptions) {
	babelRegister({
		ignore: [],
		root: pathParse(__dirname).root,
		plugins: [
			[plugin, pluginOptions]
		],
		cache: false
	});
};
