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

/**
 * Convert object to array.
 * Used for instrumenting rest param in functions.
 * @param {Object} obj - Object
 * @returns {Array} - Array
 */
function toRest(obj) {
	return defineProperties([], getOwnPropertyDescriptors(obj));
}
