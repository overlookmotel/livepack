/* --------------------
 * livepack module
 * Create tracker function for file.
 * ------------------*/

'use strict';

// Export before imports to avoid circular require cycle with `./eval.js`
module.exports = createTracker;

// Imports
const {addEvalFunctionToTracker} = require('./eval.js'),
	{tracker} = require('../shared/tracker.js');

// Exports

/**
 * Create local tracker function with additional methods specific to the file.
 * @param {Object} fileProps - File properties object
 * @param {string} fileProps.filename - File path
 * @param {number} fileProps.nextBlockId - Next block ID
 * @param {number} prefixNum - Internal vars prefix num
 * @returns {Function} tracker - Tracker function for file
 */
function createTracker(fileProps, prefixNum) {
	const localTracker = (getFnInfo, getScopes) => tracker(getFnInfo, getScopes);
	localTracker.createTracker = internalPrefixNum => createTracker(fileProps, internalPrefixNum);
	addEvalFunctionToTracker(localTracker, fileProps, prefixNum);
	return localTracker;
}
