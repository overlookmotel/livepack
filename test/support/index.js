/* --------------------
 * livepack
 * Tests support functions
 * ------------------*/

'use strict';

// Modules
const serialize = require('livepack');

// Exports

module.exports = {describeWithAllOptions, itWithAllOptions};

/**
 * Replacement for `describe` which runs tests with all serialize options.
 * `fn` will be called with `{expectSerializedEqual, run, exec}` + properties for options used.
 * `expectSerializedEqual` + `run` only do the expected JS output check when all options true.
 * @param {string} name - Test name
 * @param {Function} fn - Function containing test definitions
 * @returns {undefined}
 */
function describeWithAllOptions(name, fn) {
	describeAllOptions(name, fn, describe, describe);
}
describeWithAllOptions.only = (name, fn) => describeAllOptions(name, fn, describe.only, describe);
describeWithAllOptions.skip = (name, fn) => describeAllOptions(name, fn, describe.skip, describe);

/**
 * Replacement for `it` which runs test with all serialize options.
 * `fn` will be called with `{expectSerializedEqual, run, exec}` + properties for options used.
 * `expectSerializedEqual` + `run` only do the expected JS output check when all options true.
 * @param {string} name - Test name
 * @param {Function} fn - Test definition function
 * @returns {undefined}
 */
function itWithAllOptions(name, fn) {
	describeAllOptions(name, fn, describe, it);
}
itWithAllOptions.only = (name, fn) => describeAllOptions(name, fn, describe.only, it);
itWithAllOptions.skip = (name, fn) => describeAllOptions(name, fn, describe.skip, it);

/**
 * Run tests with all serialize options.
 * Used by `describeWithAllOptions` + `itWithAllOptions`.
 * @param {string} name - Test name
 * @param {Function} fn - Test function
 * @param {Function} topDescribe - Either `describe`, `describe.only` or `describe.skip`
 * @param {Function} describeOrIt - Either `describe` or `it`
 * @returns {undefined}
 */
function describeAllOptions(name, fn, topDescribe, describeOrIt) {
	topDescribe(name, () => {
		for (const compact of [true, false]) {
			describe(`with compact option ${compact}`, () => {
				for (const inline of [true, false]) {
					describe(`with inline option ${inline}`, () => {
						for (const mangle of [true, false]) {
							describeOrIt(`with mangle option ${mangle}`, () => {
								// Only perform check of expected JS if all options true
								const allOptionsTrue = compact && inline && mangle;
								const options = {compact, inline, mangle, comments: false};
								fn({
									expectSerializedEqual: allOptionsTrue
										? (input, expectedJs) => expectSerializedEqual(input, null, expectedJs)
										: input => expectSerializedEqual(input, options),
									run: allOptionsTrue
										? (input, expectedJs) => run(input, null, expectedJs)
										: input => run(input, options),
									exec,
									...options
								});
							});
						}
					});
				}
			});
		}
	});
}

/**
 * Serialize value to JS and test:
 *   1. Result of evaluating the JS is equal to the input value
 *   2. Serialized JS matches expectation
 *
 * @param {*} input - Input value
 * @param {Object} [options] - Options object
 * @param {string} [expectedJs] - JS code that value should serialize to (optional)
 * @returns {*} - Result of evaluation
 */
function expectSerializedEqual(input, options, expectedJs) {
	const output = run(input, options, expectedJs);
	expect(output).toEqual(input);
	return output;
}

/**
 * Serialize object to Javascript and execute it.
 * @param {*} input - Input value
 * @param {Object} [options] - Options object
 * @param {string} [expectedJs] - JS code that value should serialize to (optional)
 * @returns {*} - Result of evaluation
 */
function run(input, options, expectedJs) {
	// Serialize to JS
	const js = serialize(input, options);

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
