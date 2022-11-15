/* --------------------
 * livepack module
 * Function to get unique scope ID, with other static method attached.
 * ------------------*/

'use strict';

const {defineProperties, getOwnPropertyDescriptors} = Object;

// Exports

module.exports = getScopeId;

/**
 * Get unique scope ID.
 * @returns {number} - Scope ID
 */
function getScopeId() {
	return nextScopeId++; // eslint-disable-line no-use-before-define
}

let nextScopeId = 1;

// Add additional static methods
getScopeId.toRest = toRest;
getScopeId.wrapIterable = wrapIterable;

/**
 * Convert object to array.
 * Used for instrumenting rest param in functions.
 * @param {Object} obj - Object
 * @returns {Array} - Array
 */
function toRest(obj) {
	return defineProperties([], getOwnPropertyDescriptors(obj));
}

// eslint-disable-next-line jsdoc/require-returns-check
/**
 * Wrap an iterable to yield arrays `[scopeId, value]` where `value` is the original value from iterable
 * and `scopeId` is unique for each iteration.
 * If temp vars are required too, yielded arrays contain additional objects e.g. `[scopeId, {}, value]`.
 *
 * Used for defining scope IDs in `for of` loop initialization clause. e.g.:
 * `for (const x of [1, 2, 3]) ;` -> `for (const [livepack_scopeId, x] of wrapIterable([1, 2, 3])) ;`
 *
 * @param {Object} iterable - Iterable to be wrapped
 * @param {number} [numTempVars=0] - Number of temp vars required
 * @yields {Array} - Arrays containing scope ID, (optional) temp vars, and value from original iterator
 * @returns {Object} - Iterable object
 */
function* wrapIterable(iterable, numTempVars = 0) {
	for (const value of iterable) {
		yield [getScopeId(), ...(new Array(numTempVars).map(() => ({}))), value];
	}
}
