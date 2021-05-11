/* --------------------
 * livepack module
 * `deleteProps()` runtime function
 * ------------------*/

'use strict';

// Exports

/**
 * Delete properties on object.
 * @param {Object} obj - Object to have properties deleted from
 * @param {Array<string|number|symbol>} keys - Keys of properties to delete
 * @returns {Object} - Input object
 */
module.exports = (obj, ...keys) => (
	keys.forEach(key => delete obj[key]), // eslint-disable-line no-sequences
	obj
);
