/* --------------------
 * livepack module
 * Init.
 * Catalog globals + built-in modules.
 * Shim `Function.prototype.bind`, `WeakMap`, `WeakSet`, `Symbol`.
 * ------------------*/

'use strict';

// Imports
const getScopeId = require('./getScopeId.js');

// Imports
const addEvalFunctionsToTracker = require('./eval.js'),
	internal = require('../shared/internal.js'),
	{tracker} = require('../shared/tracker.js'),
	{COMMON_JS} = require('../shared/constants.js');

// Exports

const {globals} = internal;

/**
 * Capture `module` + `require` from file + return tracker and `getScopeId` functions.
 * @param {string} filename - File path
 * @param {Object} module - `module` object from file
 * @param {Function} require - `require` function from file
 * @param {number} nextBlockId - Next block ID
 * @param {number} prefixNum - Internal vars prefix num
 * @returns {Array<Function>} - Array containing tracker and `getScopeId` functions
 */
module.exports = (filename, module, require, nextBlockId, prefixNum) => {
	// Record `module` + `require`
	globals.set(module, {type: COMMON_JS, parent: filename, key: 'module'});
	globals.set(require, {type: COMMON_JS, parent: filename, key: 'require'});

	// Create local tracker function with additional properties and methods specific to the file
	const localTracker = (getFnInfo, getScopes) => tracker(getFnInfo, getScopes);
	localTracker.nextBlockId = nextBlockId;
	localTracker.prefixNum = prefixNum;
	addEvalFunctionsToTracker(localTracker, filename);

	// Return tracker and `getScopeId` functions
	return [localTracker, getScopeId];
};

// Imports
// These imports are after export to avoid circular requires in Jest tests
const getFunctions = require('./functions.js'),
	{getWeakSets, getWeakMaps} = require('./weak.js'),
	populateGlobals = require('./globals.js');

// Init internal vars
internal.functions = getFunctions();
internal.weakSets = getWeakSets();
internal.weakMaps = getWeakMaps();
populateGlobals(globals);
