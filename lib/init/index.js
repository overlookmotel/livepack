/* --------------------
 * livepack module
 * Init.
 * Catalog globals + built-in modules.
 * Shim `Function.prototype.bind`, `WeakMap`, `WeakSet`, `Symbol`.
 * ------------------*/

'use strict';

// Imports
const createTracker = require('./tracker.js'),
	getScopeId = require('./getScopeId.js'),
	internal = require('../shared/internal.js'),
	{COMMON_JS_MODULE} = require('../shared/constants.js');

// Exports

const {globals, functions: specialFunctions} = internal;

/**
 * Capture `module` + `require` from file + return tracker and `getScopeId` functions.
 * Livepack exposes 2 functions to be used in code instrumentation:
 *   - `livepack_tracker` is a different function in each file.
 *   - `livepack_getScopeId` is universal across all files
 * Additional methods and properties which are specific to each file are attached to `livepack_tracker`.
 * Additional methods which are universal are attached to `livepack_getScopeId`.
 *
 * @param {string} filename - File path
 * @param {Object} module - `module` object from file
 * @param {Function} require - `require` function from file
 * @param {number} nextBlockId - Next block ID
 * @param {number} prefixNum - Internal vars prefix num
 * @returns {Array<Function>} - Array containing tracker and `getScopeId` functions
 */
module.exports = (filename, module, require, nextBlockId, prefixNum) => {
	// Record `module` + `require`
	globals.set(module, {type: COMMON_JS_MODULE, parent: null, key: 'module'});
	specialFunctions.set(require, {type: 'require', path: filename});
	specialFunctions.set(require.resolve, {type: 'require', path: filename});
	specialFunctions.set(require.resolve.paths, {type: 'require', path: filename});

	// Create local tracker function with additional properties and methods specific to the file
	const blockIdCounter = {nextBlockId};
	const localTracker = createTracker(filename, blockIdCounter, prefixNum);

	// Return tracker and `getScopeId` functions
	return [localTracker, getScopeId];
};

// Imports
// These imports are after export to avoid circular requires in Jest tests
const captureFunctions = require('./functions.js'),
	{shimWeakSet, shimWeakMap} = require('./weak.js'),
	{populateGlobals} = require('./globals.js'),
	patchModule = require('./module.js');

// Init internal vars
captureFunctions(specialFunctions);
patchModule();
internal.getWeakSetEntries = shimWeakSet();
internal.getWeakMapEntries = shimWeakMap();
populateGlobals(globals);
