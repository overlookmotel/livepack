/* --------------------
 * livepack module
 * Tracker
 * ------------------*/

'use strict';

// Exports

const trackerError = {},
	dummySymbol = Symbol('livepack.DUMMY');

module.exports = {
	tracker,
	activateTracker,
	getTrackerResult,
	trackerError
};

let trackerIsActive = false,
	trackerResult;

/**
 * Tracker function.
 * Is implanted by Babel plugin in body of functions.
 * In normal operation (user code running), calling `tracker()` is a no-op.
 * It returns a Symbol, so that tracker function call can be inserted in code as an object property key.
 * When extracting scope from a function, result from tracker function is recorded and can be
 * retrieved with `getTrackerResult()`.
 * `tracker()` throws an error to prevent execution of the function under examination.
 *
 * @param {Function} getFnInfo - Function to get function info
 * @param {Function} getScopes - Function to get scope vars
 * @returns {symbol} - Dummy symbol
 * @throws {Object} - If tracker is enabled
 */
function tracker(getFnInfo, getScopes) {
	if (!trackerIsActive) return dummySymbol;

	trackerIsActive = false;
	trackerResult = {getFnInfo, getScopes};
	throw trackerError;
}

/**
 * Activate tracker.
 * @returns {undefined}
 */
function activateTracker() {
	trackerIsActive = true;
}

/**
 * Get tracker result.
 * @returns {Object} - Tracker result. Object with properties:
 *   {Function|undefined} .getFnInfo - Function to get function info (`undefined` if tracker not called)
 *   {Function|undefined} .getScopes - Function to get scope vars (`undefined` if tracker not called)
 */
function getTrackerResult() {
	const result = trackerResult;
	trackerIsActive = false;
	trackerResult = undefined;
	return result || {getFnInfo: undefined, getScopes: undefined};
}
