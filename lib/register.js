/* --------------------
 * livepack module
 * Babel register tracking
 * ------------------*/

'use strict';

// Modules
const babelRegister = require('@babel/register');

// Imports
const plugin = require('./babel.js');

// Import other functions to prevent them being loaded with babel
require('./tracker.js');
require('./index.js');

// Run

babelRegister({
	ignore: [],
	root: '/',
	plugins: [plugin],
	cache: false
});
