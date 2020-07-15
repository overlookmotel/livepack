/* --------------------
 * livepack module
 * Utility functions
 * ------------------*/

'use strict';

// Modules
const assert = require('assert');

// Exports

module.exports = {
	isJsIdentifier,
	toJsIdentifier,
	setAddFrom,
	recordIsCircular,
	deleteFirst
};

/**
 * Determine if string is valid JS identifier.
 * @param {string} name - Input string
 * @returns {boolean} - `true` if is valid JS identifier
 */
function isJsIdentifier(name) {
	return JS_ID_REGEX.test(name); // eslint-disable-line no-use-before-define
}

const JS_ID_REGEX = /^[A-Za-z$_][A-Za-z0-9$_]*$/u;

/**
 * Convert string to valid JS identifier.
 * Replace illegal chars with '_' and prefix with '_' if starts with a digit.
 * @param {string} name - Input string
 * @returns {string} - JS identifier
 */
function toJsIdentifier(name) {
	return name.replace(JS_ID_ILLEGAL_CHARS_REGEX, '_') // eslint-disable-line no-use-before-define
		.replace(STARTING_DIGIT_REGEX, digit => `_${digit}`); // eslint-disable-line no-use-before-define
}

const JS_ID_ILLEGAL_CHARS_REGEX = /[^A-Za-z0-9$_]+/gu,
	STARTING_DIGIT_REGEX = /^[0-9]/u;

/**
 * Add all entries from `from` into `set`.
 * @param {Set} set - Set
 * @param {Iterable} from - Iterable (e.g. Set, Array) whose entries to add to `set`
 * @returns {Set} - Input set
 */
function setAddFrom(set, from) {
	for (const entry of from) {
		set.add(entry);
	}
	return set;
}

/**
 * Determine if a record is a circular reference.
 * @param {Object} record - Record
 * @returns {boolean} - `true` if record is circular
 */
function recordIsCircular(record) {
	return record.node === undefined;
}

/**
 * Delete first entry from array where `fn()` returns truthy value, and returns deleted entry.
 * @param {Array} arr - Array
 * @param {Function} fn - Function to be called on each item of array
 * @returns {*} - Deleted entry
 */
function deleteFirst(arr, fn) {
	const index = arr.findIndex(fn);
	assert(index >= 0, 'Could not find matching array entry to delete');
	return arr.splice(index, 1)[0];
}
