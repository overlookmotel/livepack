/* --------------------
 * livepack module
 * Init.
 * Catalog globals + built-in modules.
 * Shim `Function.prototype.bind`, `WeakMap`, `WeakSet`, `Symbol`.
 * ------------------*/

'use strict';

// Imports
const getScopeId = require('./getScopeId.js'),
	createTracker = require('./tracker.js'),
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

	// Create local tracker function with additional methods specific to the file
	const fileProps = {filename, nextBlockId};
	const tracker = createTracker(fileProps, prefixNum);

	// Return tracker and `getScopeId` functions
	return [tracker, getScopeId];
};

// Imports
// These imports are after export to avoid circular requires in Jest tests
const captureFunctions = require('./functions.js'),
	{getWeakSets, getWeakMaps} = require('./weak.js'),
	{populateGlobals} = require('./globals.js'),
	patchModule = require('./module.js'),
	{applyEvalShim} = require('./eval.js');

// Init internal vars
captureFunctions(specialFunctions);
patchModule();
internal.weakSets = getWeakSets();
internal.weakMaps = getWeakMaps();
populateGlobals(globals);
internal.nativeEval = applyEvalShim(globals);
