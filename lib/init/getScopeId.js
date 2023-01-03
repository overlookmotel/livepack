/* --------------------
 * livepack module
 * Function to get unique scope ID, with other static method attached.
 * ------------------*/

'use strict';

const {defineProperty, defineProperties, getOwnPropertyDescriptors} = Object;

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
getScopeId.setName = setName;

/**
 * Convert object to array.
 * Used for instrumenting rest param in functions.
 * @param {Object} obj - Object
 * @returns {Array} - Array
 */
function toRest(obj) {
	return defineProperties([], getOwnPropertyDescriptors(obj));
}

/**
 * Define name property on function.
 * Used for maintaining function name for function declarations/expressions named `eval`.
 * @param {Function} fn - Function
 * @param {string} name - Name to set on function
 * @returns {Function} - Input function
 */
function setName(fn, name) {
	return defineProperty(fn, 'name', {value: name});
}
