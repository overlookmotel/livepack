/* --------------------
 * livepack
 * Tests support functions
 * ------------------*/

'use strict';

// Modules
const serialize = require('livepack');

// Exports

module.exports = {describeWithAllOptions, itWithAllOptions, stripLineBreaks};

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
		for (const minify of [true, false]) {
			describe(`with minify option ${minify}`, () => {
				for (const inline of [true, false]) {
					describe(`with inline option ${inline}`, () => {
						for (const mangle of [true, false]) {
							describeOrIt(`with mangle option ${mangle}`, () => {
								// Only perform check of expected JS if all options true
								const allOptionsTrue = minify && inline && mangle;
								const options = {minify, inline, mangle, comments: true};
								fn({
									expectSerializedEqual: allOptionsTrue
										? (input, expectedJs, validate, opts) => (
											expectSerializedEqual(input, {...options, ...opts}, expectedJs, validate)
										)
										: (input, _, validate, opts) => (
											expectSerializedEqual(input, {...options, ...opts}, null, validate)
										),
									run: allOptionsTrue
										? (input, expectedJs, validate, opts) => (
											run(input, {...options, ...opts}, expectedJs, validate)
										)
										: (input, _, validate, opts) => (
											run(input, {...options, ...opts}, null, validate)
										),
									serialize: (input, opts) => serialize(input, {...options, ...opts}),
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
 *   3. Validate function (if provided) passes on both input and output
 *
 * @param {*} input - Input value
 * @param {Object} [options] - Options object
 * @param {string} [expectedJs] - JS code that value should serialize to (optional)
 * @param {Function} [validate] - Function to validate result
 * @returns {*} - Result of evaluation
 */
function expectSerializedEqual(input, options, expectedJs, validate) {
	const output = run(input, options, expectedJs);
	expect(output).toEqual(input);
	if (validate) {
		validate(input);
		validate(output);
	}
	return output;
}

/**
 * Serialize object to Javascript and execute it.
 * @param {*} input - Input value
 * @param {Object} [options] - Options object
 * @param {string} [expectedJs] - JS code that value should serialize to (optional)
 * @param {Function} [validate] - Function to validate result
 * @returns {*} - Result of evaluation
 */
function run(input, options, expectedJs, validate) {
	// Serialize to JS
	const js = serialize(input, options);

	// Check expected JS output
	if (expectedJs != null) expect(removeEslintComments(js)).toBe(expectedJs);

	// Execute JS
	const output = exec(js, options.format || 'js');

	// Validate input + output
	if (validate) {
		validate(input);
		validate(output);
	}

	// Return exported value
	return output;
}

/**
 * Execute JS code and return value.
 * @param {string} js - Javascript code
 * @param {string} format - 'js' / 'cjs' / 'esm'
 * @returns {*} - Result of evaluation
 */
function exec(js, format) {
	if (format === 'js') {
		return new Function('require', `return ${js}`)(require); // eslint-disable-line no-new-func
	}

	if (format === 'cjs') {
		const mod = {exports: {}};
		// eslint-disable-next-line no-new-func
		new Function('module', 'exports', 'require', js)(mod, mod.exports, require);
		return mod.exports;
	}

	throw new Error(`'${format}' format not supported`);
}

function removeEslintComments(js) {
	// NB Comments cause Babel to add semicolons at end of blocks, which it otherwise doesn't
	return js.replace(/\/\/ eslint-disable-line [^\n]+\n/g, '')
		.replace(/;}/g, '}');
}

function stripLineBreaks(js) {
	return removeEslintComments(js).replace(/\n\s+/g, '');
}
