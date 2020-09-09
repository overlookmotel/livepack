/* --------------------
 * livepack module
 * Babel plugin
 * ------------------*/

'use strict';

// Modules
const pathJoin = require('path').join,
	assert = require('simple-invariant'),
	{isString} = require('is-it-type');

// Imports
const visitor = require('./visitor.js');

// Constants
const INIT_PATH = pathJoin(__dirname, '../init/index.js');

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
 * When any function is called, it calls `tracker.track()` with the values of vars in scope
 * of it's enclosing function, the scope ID, and parent scope's scope ID.
 *
 * Plugin is implemented as a single Program exit visitor which performs a sub-traversal to do its work.
 * This approach is necessary to avoid ordering interactions with other plugins.
 *
 * @param {Object} api - Babel API object
 * @param {Object} options - Options object
 * @param {string} [options.initPath] - Path to `init` script file
 * @returns {Object} - Babel plugin object
 */
module.exports = function livepackBabelPlugin(api, options) {
	// Get init require path
	let {initPath} = options;
	if (initPath == null) {
		initPath = INIT_PATH;
	} else {
		assert(isString(initPath), 'options.initPath must be a string if provided');
	}

	// Return visitors
	return {
		visitor: {
			Program: {
				exit: (path, state) => visitor(path, state, initPath)
			}
		}
	};
};
