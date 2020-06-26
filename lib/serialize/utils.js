/* --------------------
 * livepack module
 * Utility functions
 * ------------------*/

'use strict';

// Exports

module.exports = {
	isJsIdentifier,
	toJsIdentifier,
	setAddFrom
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
