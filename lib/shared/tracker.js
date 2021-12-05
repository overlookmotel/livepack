/* --------------------
 * livepack module
 * Tracker
 * ------------------*/

'use strict';

// Exports

let callback;
const trackerError = {};

module.exports = {
	tracker,
	setTrackerCallback,
	resetTrackerCallback,
	trackerError
};

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

	callback(getScopes);
	callback = undefined;

	throw trackerError;
}

/**
 * Set tracker callback function.
 * @param {Function} trackerCallback - Callback to be called with function scopes
 * @returns {undefined}
 */
function setTrackerCallback(trackerCallback) {
	callback = trackerCallback;
}

/**
 * Reset tracker callback.
 * @returns {undefined}
 */
function resetTrackerCallback() {
	callback = undefined;
}
