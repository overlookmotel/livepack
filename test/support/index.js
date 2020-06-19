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
	exec,
	run
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
	const js = serialize(input, {inline: true});

	if (expectedJs !== undefined) {
		expect(js).toEqual(`module.exports = ${expectedJs};`);
	}

	const output = exec(js);
	expect(output).toEqual(input);
	return output;
}

/**
 * Execute JS code and return value of `module.exports`.
 * @param {string} js - Javascript code
 * @returns {*} - Result of evaluation
 */
function exec(js) {
	const fn = new Function('module', js); // eslint-disable-line no-new-func
	const module = {exports: {}};
	fn(module);
	return module.exports;
}

/**
 * Serialize object to Javascript and execute it.
 * @param {*} input - Input value
 * @returns {*} - Result of evaluation
 */
function run(input) {
	// Serialize to JS
	const js = serialize(input, {inline: true});

	// Execute JS and return exported value
	return exec(js);
}
