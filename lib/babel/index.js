/* --------------------
 * livepack module
 * Babel plugin
 * ------------------*/

'use strict';

// Modules
const {declare} = require('@babel/helper-plugin-utils');

// Imports
const visitor = require('./visitor.js');

// Exports

/**
 * Babel plugin.
 * Adds tracking code to all functions.
 *
 * Every function gets a unique ID.
 * In addition, every time a function is called, it gets a unique scope ID.
 * The scope ID represents the scope of function for that call.
 * If a function returns (or saves in an external var) another function, that function
 * will inherit the scope of this function.
 * Scope IDs track this, so it's possible to determine value of vars outside scope of a function.
 *
 * When any function is called, it calls `tracker()` with the values of vars in scope
 * of it's enclosing function, the scope ID, and parent scope's scope ID.
 *
 * Plugin is implemented as a single Program exit visitor which performs a sub-traversal to do its work.
 * This approach is necessary to avoid ordering interactions with other plugins.
 *
 * @param {Object} api - Babel API object
 * @returns {Object} - Babel plugin object
 */
module.exports = declare((api) => {
	api.assertVersion(7);

	return {
		name: 'livepack/babel',
		visitor: {
			Program: {
				exit: visitor
			}
		}
	};
});
