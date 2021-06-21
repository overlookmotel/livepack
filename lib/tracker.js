/* --------------------
 * livepack module
 * Tracker
 * ------------------*/

'use strict';

// Exports

module.exports = tracker;

let callback;
const error = {};

/**
 * Tracker function.
 * Is implanted by Babel plugin in parameters of functions.
 * In normal operation (user code running), `tracker()` returns `undefined`.
 * When extracting scope from a function, `callback` is set to a function to call with extracted
 * scope vars and `tracker()` throws an error to prevent execution of the function under examination.
 * @param {Function} getScopes - Function to get scope vars
 * @returns {undefined}
 * @throws {Object} - If tracker is enabled
 */
function tracker(getScopes) {
	if (!callback) return undefined;

	callback(getScopes());
	callback = undefined;

	throw error;
}

tracker.setCallback = (_callback) => {
	callback = _callback;
};

tracker.error = error;
