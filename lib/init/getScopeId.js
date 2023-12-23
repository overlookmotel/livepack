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
getScopeId.renameRequireAlias = renameRequireAlias;

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
 * Set name property of a function to 'require'.
 * @param {Function} req - Function
 * @returns {Function} - Input function
 */
function renameRequireAlias(req) {
	return defineProperty(req, 'name', {value: 'require'});
}
