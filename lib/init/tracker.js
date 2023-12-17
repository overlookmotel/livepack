/* --------------------
 * livepack module
 * Init.
 * Create tracker function for file or for `eval()`.
 * ------------------*/

'use strict';

// Export before imports to avoid circular require with `./eval.js`
module.exports = createTracker;

// Imports
const addWrapWithFunctionToTracker = require('./with.js'),
	addEvalFunctionsToTracker = require('./eval.js'),
	{tracker} = require('../shared/tracker.js');

// Exports

/**
 * Create local tracker function with additional properties and methods specific to the file.
 * @param {string} filename - File path
 * @param {Object} blockIdCounter - Block ID counter for file
 * @param {number} prefixNum - Internal vars prefix num
 * @returns {Function} - Local tracker function
 */
function createTracker(filename, blockIdCounter, prefixNum) {
	const localTracker = (getFnInfo, getScopes) => tracker(getFnInfo, getScopes);
	addWrapWithFunctionToTracker(localTracker, prefixNum);
	addEvalFunctionsToTracker(localTracker, filename, blockIdCounter, prefixNum);
	return localTracker;
}
