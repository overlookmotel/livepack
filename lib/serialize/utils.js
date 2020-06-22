/* --------------------
 * livepack module
 * Utility functions
 * ------------------*/

'use strict';

// Exports

module.exports = {
	toJsIdentifier
};

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
