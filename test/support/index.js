/* --------------------
 * livepack
 * Tests support functions
 * ------------------*/

'use strict';

// Modules
const {serialize} = require('livepack'),
	parseNodeVersion = require('parse-node-version'),
	{isString, isFullString, isObject, isFunction, isBoolean} = require('is-it-type'),
	assert = require('simple-invariant');

// Exports

module.exports = { // eslint-disable-line jest/no-export
	itSerializes: wrapTestFunction(itSerializes),
	itSerializesEqual: wrapTestFunction(itSerializesEqual),
	stripLineBreaks,
	stripSourceMapComment,
	tryCatch,
	spy: jest.fn,

	describeWithAllOptions, // TODO Remove once migration to `itSerializes()` complete
	itWithAllOptions // TODO Remove once migration to `itSerializes()` complete
};

// Disable source maps on Node 10 on CI as causes out of memory errors
const NO_SOURCE_MAPS = !!process.env.CI && parseNodeVersion(process.version).major < 12;

/**
 * Wrap test function (`itSerializes` / `itSerializesEqual`) to add `.skip` and `.only` methods,
 * as with Jest's `it()`.
 * Wrapped functions capture stack trace for call of the test function.
 * Test function is called with `describe` / `describe.skip` / `describe.only` as first arg,
 * and `customExpect` function as 2nd arg.
 * @param {Function} fn - Test function
 * @returns {Function} - Wrapped test function
 */
function wrapTestFunction(fn) {
	function wrapped(...args) {
		fn(describe, getCustomExpect(wrapped), ...args);
	}
	wrapped.skip = function skip(...args) {
		fn(describe.skip, getCustomExpect(skip), ...args);
	};
	wrapped.only = function only(...args) {
		fn(describe.only, getCustomExpect(only), ...args);
	};
	return wrapped;
}

function getCustomExpect(callFn) {
	// Capture stack trace at point of calling `itSerializes` / `isSerializesEqual`
	const callErr = new Error();
	Error.captureStackTrace(callErr, callFn);

	// Return function which runs an expectation and wraps any error thrown
	// with custom message and stack trace for original call to `itSerializes` / `isSerializesEqual`
	return function(msg, fn) {
		try {
			fn();
		} catch (err) {
			err.message = `${msg}${err.message.match(/\r?\n\r?\n[\s\S]*$/)[0]}`;
			err.stack = callErr.stack;
			throw err;
		}
	};
}

/**
 * Test that `serialize()` serializes input as expected.
 * @param {Function} describe - Describe function (injected by `wrapTestFunction()`)
 * @param {Function} customExpect - Function to run expectation
 *   and augument error with message and call stack (injected by `wrapTestFunction()`)
 * @param {string} name - Test name
 * @param {Object} options - Options object
 * @param {Function} options.in - Function returning value to serialize
 * @param {string} [options.out] - Expected output JS
 * @param {Function} [options.validate] - Function to validate eval-ed output
 * @param {string} [options.format='js'] - Format option to pass to `serialize()`
 * @param {boolean} [options.equal=false] - If set, checks equality between input and eval-ed output
 *   using `expect(output).toEqual(input)`
 * @param {boolean} [options.preserveLineBreaks=false] - If set, does not remove line breaks
 *   from `options.out` before comparing against output
 * @param {boolean} [options.preserveComments=false] - If set, does not remove comments from output
 *   before comparing against `options.out`
 * @param {boolean} [options.minify] - If defined, only runs with that option
 * @param {boolean} [options.inline] - If defined, only runs with that option
 * @param {boolean} [options.mangle] - If defined, only runs with that option
 * @returns {undefined}
 */
function itSerializes(describe, customExpect, name, options) {
	// Validate args
	assert(isFullString(name), '`name` must be a string');
	assert(isObject(options), '`options` must be an object');

	const inputFn = options.in;
	assert(isFunction(inputFn), '`options.in` must be a function');

	let {format} = options;
	if (format === undefined) {
		format = 'js';
	} else {
		assert(isString(format), '`options.format` must be a string if provided');
	}

	let {preserveLineBreaks} = options;
	if (preserveLineBreaks === undefined) {
		preserveLineBreaks = false;
	} else {
		assert(isBoolean(preserveLineBreaks), '`options.preserveLineBreaks` must be a boolean if provided');
	}

	let {preserveComments} = options;
	if (preserveComments === undefined) {
		preserveComments = false;
	} else {
		assert(isBoolean(preserveComments), '`options.preserveComments` must be a boolean if provided');
	}

	let expectedOutput = options.out;
	if (expectedOutput !== undefined) {
		assert(isString(expectedOutput), '`options.out` must be a string if provided');
		// Remove line breaks
		if (!preserveLineBreaks) expectedOutput = stripLineBreaks(expectedOutput);
	}

	const {validate} = options;
	assert(
		validate === undefined || isFunction(validate),
		'`options.validate` must be a function if provided'
	);

	let {validateInput} = options;
	if (validateInput === undefined) {
		validateInput = validate;
	} else {
		assert(isFunction(validateInput), '`options.validateInput` must be a function if provided');
	}

	let {validateOutput} = options;
	if (validateOutput === undefined) {
		validateOutput = validate;
	} else {
		assert(isFunction(validateOutput), '`options.validateOutput` must be a function if provided');
	}

	let {equal} = options;
	if (equal === undefined) {
		equal = false;
	} else {
		assert(isBoolean(equal), '`options.equal` must be a boolean if provided');
	}

	assert(
		expectedOutput !== undefined || validateOutput || equal,
		'`out`, `validate`, `validateOutput` or `equal` option must be provided'
	);

	const unknownKey = Object.keys(options).find(
		key => ![
			'in', 'out', 'validate', 'validateInput', 'validateOutput',
			'format', 'equal', 'preserveLineBreaks', 'preserveComments',
			'minify', 'inline', 'mangle'
		].includes(key)
	);
	assert(!unknownKey, `Unexpected option '${unknownKey}'`);

	// Run test function with all options
	describe(name, () => {
		itAllOptions(options, async (opts) => {
			// Add other options
			opts.format = format;
			opts.comments = true;
			opts.sourceMaps = !NO_SOURCE_MAPS;

			// Get value
			const ctx = Object.create(null);
			const input = inputFn({...opts, ctx});

			// Serialize value
			const outputJs = serialize(input, opts);

			// Check output matches expected
			if (opts.minify && opts.inline && opts.mangle && expectedOutput !== undefined) {
				let testOutputJs = outputJs;
				if (!preserveComments) testOutputJs = stripComments(testOutputJs);

				customExpect(
					'Output does not match expected',
					// eslint-disable-next-line jest/no-standalone-expect
					() => expect(testOutputJs).toBe(expectedOutput)
				);
			}

			// Evaluate output
			const output = exec(outputJs, format);

			// Check output equals input
			if (equal) {
				customExpect(
					'Eval-ed output does not equal input',
					// eslint-disable-next-line jest/no-standalone-expect
					() => expect(output).toEqual(input)
				);
			}

			// Run validation function on input and output
			if (validateInput) {
				try {
					await validateInput(input, {...opts, ctx, isInput: true, isOutput: false});
				} catch (err) {
					err.message = `Validation failed on input\n\n${err.message}`;
					throw err;
				}
			}

			if (validateOutput) {
				try {
					await validateOutput(output, {...opts, ctx, isInput: false, isOutput: true, input, outputJs});
				} catch (err) {
					err.message = `Validation failed on output\n\n${err.message}`;
					throw err;
				}
			}
		});
	});
}

/**
 * Test that `serialize()` serializes input as expected, and eval-ed output is equal to input.
 * Equivalent to calling `itSerializes()` with `equal: true` option.
 *
 * Can be called with an options object, same as `itSerializes()`.
 * Or called with shortcut `name, inputFn, expectedOutput, validate`.
 * The above is equivalent to calling with `name, {in: inputFn, out: expectedOutput, validate}`.
 *
 * @param {Function} describe - Describe function (injected by `wrapTestFunction()`)
 * @param {Function} customExpect - Function to run expectation
 *   and augument error with message and call stack (injected by `wrapTestFunction()`)
 * @param {string} name - Test name
 * @param {Object|Function} options - Options object, same as for `itSerializes()`
 * @param {string} [expectedOutput] - Expected output
 * @param {Function} [validate] - Function to validate eval-ed output
 * @returns {undefined}
 */
function itSerializesEqual(describe, customExpect, name, options, expectedOutput, validate) {
	if (isFunction(options)) {
		options = {in: options, out: expectedOutput, validate};
	} else {
		assert(isObject(options), '`options` must be an object');
	}

	itSerializes(describe, customExpect, name, {...options, equal: true});
}

/**
 * Run test function with all combinations of `minify`, `inline` and `mangle` options.
 * @param {Object} options - Options object
 * @param {boolean} [options.minify] - If defined, only runs with that option
 * @param {boolean} [options.inline] - If defined, only runs with that option
 * @param {boolean} [options.mangle] - If defined, only runs with that option
 * @param {Function} fn - Test function
 * @returns {undefined}
 */
function itAllOptions(options, fn) {
	for (const minify of options.minify === undefined ? [true, false] : [options.minify]) {
		describe(`minify: ${minify}`, () => {
			for (const inline of options.inline === undefined ? [true, false] : [options.inline]) {
				describe(`inline: ${inline}`, () => {
					for (const mangle of options.mangle === undefined ? [true, false] : [options.mangle]) {
						// eslint-disable-next-line jest/expect-expect, arrow-body-style
						it(`mangle: ${mangle}`, () => {
							return fn({minify, inline, mangle}); // eslint-disable-line jest/no-test-return-statement
						});
					}
				});
			}
		});
	}
}

/**
 * TODO Remove once migration to `itSerializes()` complete.
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
 * TODO Remove once migration to `itSerializes()` complete.
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
 * TODO Remove once migration to `itSerializes()` complete.
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
								const options = {minify, inline, mangle, comments: true, sourceMaps: !NO_SOURCE_MAPS};
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
 * TODO Remove once migration to `itSerializes()` complete.
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
		validate(input, false);
		validate(output, true);
	}
	return output;
}

/**
 * TODO Remove once migration to `itSerializes()` complete.
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
	if (expectedJs != null) expect(stripComments(js)).toBe(expectedJs);

	// Execute JS
	const output = exec(js, options.format || 'js');

	// Validate input + output
	if (validate) {
		validate(input, false);
		validate(output, true);
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

	if (format === 'esm') {
		const proxy = {exports: undefined, require};
		// eslint-disable-next-line no-new-func
		new Function(
			'$__proxy',
			js.replace(/(^|;\n?)export default/, (_, before) => `${before}$__proxy.exports=`)
				.replace(
					/(^|;\n?)import ([^ ]+) from ?("[^"]+")/g,
					(_, before, varName, path) => `${before}const ${varName}=$__proxy.require(${path})`
				)
		)(proxy);
		return proxy.exports;
	}

	// CJS
	const mod = {exports: {}};
	// eslint-disable-next-line no-new-func
	new Function('module', 'exports', 'require', js)(mod, mod.exports, require);
	return mod.exports;
}

/*
 * Code sanitization functions.
 */

function stripComments(js) {
	return stripSourceMapComment(stripEslintComments(js));
}

function stripEslintComments(js) {
	// NB Comments cause Babel to add semicolons at end of blocks, which it otherwise doesn't
	return js.replace(/\/\/ eslint-disable-line [^\n]+\n/g, '')
		.replace(/;}/g, '}');
}

function stripSourceMapComment(js) {
	return js.replace(/\n\/\/# sourceMappingURL=[^\n]+\n?$/, '');
}

function stripLineBreaks(js) {
	return stripComments(js).replace(/\n\s*/g, '');
}

/**
 * Execute function and return error it throws, or `undefined` if it doesn't throw.
 * @param {Function} fn - Function
 */
function tryCatch(fn) { // eslint-disable-line consistent-return
	try {
		fn();
	} catch (err) {
		return err;
	}
}
