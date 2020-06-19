/* --------------------
 * livepack
 * Tests support functions
 * ------------------*/

'use strict';

// Modules
const serialize = require('livepack');

// Exports

module.exports = {
	expectSerializedEqual,
	run,
	exec
};

/**
 * Serialize value to JS and test:
 *   1. Result of evaluating the JS is equal to the input value
 *   2. Serialized JS matches expectation
 *
 * @param {*} input - Input value
 * @param {string} [expectedJs] - JS code that value should serialize to (optional)
 * @returns {*} - Result of evaluation
 */
function expectSerializedEqual(input, expectedJs) {
	const output = run(input, expectedJs);
	expect(output).toEqual(input);
	return output;
}

/**
 * Serialize object to Javascript and execute it.
 * @param {*} input - Input value
 * @param {string} [expectedJs] - JS code that value should serialize to (optional)
 * @returns {*} - Result of evaluation
 */
function run(input, expectedJs) {
	// Serialize to JS
	const js = serialize(input);

	// Check expected JS output
	if (expectedJs !== undefined) expect(js).toBe(expectedJs);

	// Execute JS and return exported value
	return exec(js);
}

/**
 * Execute JS code and return value.
 * @param {string} js - Javascript code
 * @returns {*} - Result of evaluation
 */
function exec(js) {
	return new Function(`return ${js}`)(); // eslint-disable-line no-new-func
}
