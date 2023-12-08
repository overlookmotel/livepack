/* --------------------
 * livepack
 * Tests support functions
 * ------------------*/

/* eslint-disable import/order, import/newline-after-import */

'use strict';

// Modules
const {join: pathJoin, dirname} = require('path').posix,
	{serialize, serializeEntries} = require('livepack');

// Load packages from internal module cache to avoid them being transpiled.
// `shared/internal.js` MUST be loaded from internal cache so it refers to same object
// used internally in Livepack, so `afterEach` cleanup hook works as intended.
const {useInternalModuleCache, useGlobalModuleCache} = require('../../lib/shared/moduleCache.js');
useInternalModuleCache();

const mapValues = require('lodash/mapValues'),
	{isString, isFullString, isObject, isFunction, isArray, isBoolean} = require('is-it-type'),
	assert = require('simple-invariant');

// Imports
const {createFixtures, cleanupFixtures, withFixtures, serializeInNewProcess} = require('./fixtures.js'),
	transpiledFiles = require('./transpiledFiles.js'),
	internalSplitPoints = require('../../lib/shared/internal.js').splitPoints;

useGlobalModuleCache();

// Constants
const FORMAT_NAMES = {js: 'JS', esm: 'ESM', cjs: 'CommonJS'};

// Exports

module.exports = { // eslint-disable-line jest/no-export
	itSerializes: wrapItSerializes(),
	itSerializesEqual: wrapItSerializes({equal: true}),
	stripLineBreaks,
	stripSourceMapComment,
	createFixtures,
	cleanupFixtures,
	withFixtures,
	serializeInNewProcess,
	tryCatch,
	transpiledFiles
};

// `LIVEPACK_TEST_QUICK` env runs tests in default options only
const DEFAULT_OPTIONS = process.env.LIVEPACK_TEST_QUICK ? {minify: true, mangle: true} : null;
const PROFILE_ONLY = process.env.LIVEPACK_TEST_PROFILE;

// Hook to empty split points registry after each test
afterEach(() => {
	internalSplitPoints.clear();
});

/**
 * Wrap `itSerializes` to add `.skip()`, `.only()` and `.each()` methods, as with Jest's `it()`.
 *
 * Internal support functions will be removed from stack trace if test throws an error,
 * so stack trace will reflect where `isSerializes()` is called in the test file.
 *
 * Default options object can also be provided, which will be merged into options.
 * `.withOptions()` method allows tests to create their own custom `itSerializes()` with default options.
 *
 * `itSerializes` is called with additional args:
 *   1. Default options object
 *   2. `describe` / `describe.skip` / `describe.only`
 *   3. Custom `expect` wrapper
 *
 * @param {Object} [defaultOptions] - Default options object
 * @returns {Function} - Wrapped test function
 */
function wrapItSerializes(defaultOptions) {
	function wrapped(name, options) {
		itSerializes(name, options, defaultOptions, describe, createRunExpectationFn(wrapped));
	}
	wrapped.skip = function skip(name, options) {
		itSerializes(name, options, defaultOptions, describe.skip, createRunExpectationFn(skip));
	};
	wrapped.only = function only(name, options) {
		itSerializes(name, options, defaultOptions, describe.only, createRunExpectationFn(only));
	};
	wrapped.each = function each(cases, name, getOptions) {
		const customExpect = createRunExpectationFn(each);
		describe.each(cases)(name, (...caseProps) => { // eslint-disable-line jest/valid-title
			itSerializes(name, getOptions(...caseProps), defaultOptions, null, customExpect);
		});
	};
	wrapped.withOptions = function(options) {
		assert(isObject(options), '`options` must be an object');
		return wrapItSerializes({...defaultOptions, ...options});
	};
	return wrapped;
}

function createRunExpectationFn(callFn) {
	if (PROFILE_ONLY) return (msg, fn) => { fn(); };

	// Capture stack trace at point of calling `itSerializes`
	const callErr = new Error();
	Error.captureStackTrace(callErr, callFn);

	// Return function which runs an expectation and wraps any error thrown
	// with custom message and stack trace for original call to `itSerializes`
	return function(msg, fn) {
		try {
			fn();
		} catch (_err) {
			const err = _err || new Error('Unknown error');
			const match = err.message.match(/\r?\n\r?\n[\s\S]*$/);
			if (match) {
				const message = `${msg}${match[0]}`;
				err.message = message;
				err.stack = callErr.stack.replace(/^[^\r\n]+/, message);
			}
			throw err;
		}
	};
}

/**
 * Test that `serialize()` serializes input as expected.
 * @param {string} name - Test name
 * @param {Object} options - Options object
 * @param {Function} options.in - Function returning value to serialize
 * @param {string|Object} [options.out] - Expected output JS
 * @param {string|Object} [options.outJs] - Expected output JS for `js` format
 * @param {string|Object} [options.outEsm] - Expected output JS for `esm` format
 * @param {string|Object} [options.outCjs] - Expected output JS for `cjs` format
 * @param {Function} [options.validate] - Function to validate eval-ed output
 * @param {string|Array<string>} [options.format='js'] - Format option to pass to `serialize()`.
 *   Can also provide an array of formats.
 * @param {boolean} [options.equal=false] - If set, checks equality between input and eval-ed output
 *   using `expect(output).toEqual(input)`
 * @param {boolean} [options.entries=false] - If set, serializes with `serializeEntries()`
 * @param {boolean} [options.preserveLineBreaks=false] - If set, does not remove line breaks
 *   from `options.out` before comparing against output
 * @param {boolean} [options.preserveComments=false] - If set, does not remove comments from output
 *   before comparing against `options.out`
 * @param {boolean} [options.minify] - If defined, only runs with that option
 * @param {boolean} [options.mangle] - If defined, only runs with that option
 * @param {boolean} [options.strictEnv] - If defined, calls `serialize()` with that option
 * @param {string} [options.entryChunkName] - If defined, calls `serialize()` with that option
 * @param {string} [options.splitChunkName] - If defined, calls `serialize()` with that option
 * @param {string} [options.commonChunkName] - If defined, calls `serialize()` with that option
 * @param {Object} [defaultOptions] - Default options object (injected by `wrapTestFunction()`)
 * @param {Function} describe - Describe function (injected by `wrapTestFunction()`)
 * @param {Function} runExpectation - Function to run expectation
 *   and augument error with message and call stack (injected by `wrapTestFunction()`)
 * @returns {undefined}
 */
function itSerializes(name, options, defaultOptions, describe, runExpectation) {
	// Validate args
	assert(isFullString(name), '`name` must be a string');
	assert(isObject(options), '`options` must be an object');

	// Merge in default options
	if (defaultOptions) options = {...defaultOptions, ...options};

	// Validate options
	const getInput = options.in;
	assert(
		isFunction(getInput) || isString(getInput)
		|| (isObject(getInput) && Object.values(getInput).every(isString)),
		'`options.in` must be a function, string, or object with string values'
	);

	let {entries} = options;
	if (entries === undefined) {
		entries = false;
	} else {
		assert(isBoolean(entries), '`options.entries` must be a boolean if provided');
	}

	let formats;
	const formatOpt = options.format;
	if (formatOpt === undefined) {
		formats = [entries ? 'cjs' : 'js'];
	} else if (isString(formatOpt)) {
		formats = [formatOpt];
	} else {
		assert(
			isArray(formatOpt) && !formatOpt.find(format => !isString(format)),
			'`options.format` must be a string or array of strings if provided'
		);
		formats = formatOpt;
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

	assert(
		options.out === undefined || formats.length === 1,
		'Cannot use `options.out` if testing multiple formats'
	);
	const expectedOutputs = {};
	for (const [optName, format] of [
		['out', formats[0]],
		['outJs', 'js'],
		['outEsm', 'esm'],
		['outCjs', 'cjs']
	]) {
		let expectedOutput = options[optName];
		if (expectedOutput !== undefined) {
			assert(
				formats.includes(format),
				`\`options.${optName}\` cannot be used unless '${format}' is included in \`options.format\``
			);

			if (isString(expectedOutput)) {
				assert(!entries, `\`options.${optName}\` must be an object if \`options.entries\` is set`);
				expectedOutput = {'index.js': expectedOutput};
			} else {
				assert(
					isObject(expectedOutput),
					`\`options.${optName}\` must be a string or object if provided`
				);
				assert(entries, `\`options.${optName}\` must be a string if \`options.entries\` is not set`);
			}

			// Remove line breaks
			if (!preserveLineBreaks) expectedOutput = mapValues(expectedOutput, stripLineBreaks);

			expectedOutputs[format] = expectedOutput;
		}
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
		validateOutput || equal || !formats.find(format => !expectedOutputs[format]),
		'`out` / `outJs` / `outEsm` / `outCjs`, `validate`, `validateOutput` or `equal` option must be provided'
	);

	const otherOptions = {};
	for (const optName of ['strictEnv', 'entryChunkName', 'splitChunkName', 'commonChunkName']) {
		const value = options[optName];
		if (value != null) otherOptions[optName] = value;
	}

	const unknownKey = Object.keys(options).find(
		key => ![
			'in', 'out', 'outJs', 'outEsm', 'outCjs',
			'validate', 'validateInput', 'validateOutput',
			'format', 'equal', 'entries', 'preserveLineBreaks', 'preserveComments',
			'minify', 'mangle',
			'strictEnv',
			'entryChunkName', 'splitChunkName', 'commonChunkName'
		].includes(key)
	);
	assert(!unknownKey, `Unexpected option '${unknownKey}'`);

	// Define wrapper for fixtures
	const getInputAndRunTest = isFunction(getInput)
		? (opts, ctx) => {
			const input = getInput({...opts, ctx});
			return runTest(input, opts, {ctx});
		}
		: (opts, ctx) => withFixtures(
			getInput,
			(input, fixtureOpts) => runTest(input, opts, {
				ctx,
				fixturePath: fixtureOpts.path,
				fixturePaths: fixtureOpts.paths,
				transpiled: fixtureOpts.transpiled
			})
		);

	// Run test function with all options
	if (describe) {
		describe(name, defineTests);
	} else {
		defineTests();
	}

	function defineTests() {
		if (formats.length === 1) {
			defineFormatTests(formats[0]);
		} else {
			for (const format of formats) {
				describe(`${FORMAT_NAMES[format]} format`, () => {
					defineFormatTests(format);
				});
			}
		}
	}

	function defineFormatTests(format) {
		itAllOptions(options, (opts) => {
			// Add other options
			opts.format = format;
			opts.comments = true;
			opts.sourceMaps = true;
			opts.files = true;
			if (format !== 'cjs') opts.strictEnv = true;
			Object.assign(opts, otherOptions);

			// Run test
			const ctx = Object.create(null);
			return getInputAndRunTest(opts, ctx);
		});
	}

	async function runTest(input, opts, testOpts) {
		// Serialize value
		const outputFiles = entries ? serializeEntries(input, opts) : serialize(input, opts);

		// If in profiling mode, don't test output
		if (PROFILE_ONLY) return;

		// Convert files to object and discard source map files
		const outputFilesObj = {},
			fileMappings = [];
		for (const file of outputFiles) {
			const {filename} = file;
			if (filename.endsWith('.map')) continue;
			assert(!outputFilesObj[filename], `Multiple outputs with same filename '${filename}'`);
			outputFilesObj[filename] = file.content;
			if (file.type === 'entry') fileMappings.push({name: file.name, filename});
		}

		// Check output matches expected
		const expectedOutput = expectedOutputs[opts.format];
		if (opts.minify && opts.mangle && expectedOutput !== undefined) {
			const testFilesObj = preserveComments
				? outputFilesObj
				: mapValues(outputFilesObj, stripComments);

			runExpectation(
				'Output does not match expected',
				() => expect(testFilesObj).toEqual(expectedOutput)
			);
			runExpectation(
				'Output files order does not match expected',
				() => expect(Object.keys(testFilesObj)).toEqual(Object.keys(expectedOutput))
			);
		}

		// Evaluate output
		let output = execFiles(outputFilesObj, fileMappings, opts.format, opts.strictEnv);
		if (!entries) output = output.index;

		// Check output equals input
		if (equal) {
			runExpectation(
				'Eval-ed output does not equal input',
				() => expect(output).toEqual(input)
			);
		}

		// Run validation function on input and output
		if (validateInput) {
			try {
				await validateInput(input, {...opts, ...testOpts, isInput: true, isOutput: false});
			} catch (err) {
				// eslint-disable-next-line no-ex-assign
				if (typeof err !== 'object' || err === null) err = new Error('Unknown error');
				err.message = `Validation failed on input\n\n${err.message}`;
				throw err;
			}
		}

		if (validateOutput) {
			const outputJs = entries ? outputFilesObj : outputFilesObj['index.js'];
			try {
				await validateOutput(output, {
					...opts, ...testOpts, isInput: false, isOutput: true, input, outputJs
				});
			} catch (err) {
				err.message = `Validation failed on output\n\n${err.message}`;
				throw err;
			}
		}
	}
}

/**
 * Run test function with all combinations of `minify` and `mangle` options.
 * @param {Object} options - Options object
 * @param {boolean} [options.minify] - If defined, only runs with that option
 * @param {boolean} [options.mangle] - If defined, only runs with that option
 * @param {Function} fn - Test function
 * @returns {undefined}
 */
function itAllOptions(options, fn) {
	if (DEFAULT_OPTIONS) options = {...DEFAULT_OPTIONS, ...options};

	for (const minify of options.minify === undefined ? [true, false] : [options.minify]) {
		describe(`minify: ${minify}`, () => {
			for (const mangle of options.mangle === undefined ? [true, false] : [options.mangle]) {
				// eslint-disable-next-line jest/expect-expect, arrow-body-style
				it(`mangle: ${mangle}`, () => {
					return fn({minify, mangle}); // eslint-disable-line jest/no-test-return-statement
				});
			}
		});
	}
}

/**
 * Execute JS code and return value.
 * @param {Object} filesObj - Javascript code files
 * @param {Array<Object>} fileMappings - Mappings of name to filename for files to execute
 * @param {string} format - 'js' / 'cjs' / 'esm'
 * @param {boolean} strictEnv - `true` if to run in strict mode
 * @returns {Object} - Result of evaluation
 */
function execFiles(filesObj, fileMappings, format, strictEnv) {
	const moduleCache = Object.create(null),
		entryFilenames = new Set(fileMappings.map(fileMapping => fileMapping.filename));

	function loadFile(filename, isEntry) {
		assert(
			isEntry || format !== 'js' || !entryFilenames.has(filename),
			'Cannot require/import a JS format entry point'
		);

		let moduleObj = moduleCache[filename];
		if (moduleObj) return moduleObj;
		moduleObj = Object.seal(
			Object.create(null, {
				default: {
					value: undefined,
					writable: true,
					enumerable: true,
					configurable: false
				},
				[Symbol.toStringTag]: {
					value: 'Module',
					writable: false,
					enumerable: false,
					configurable: false
				}
			})
		);
		moduleCache[filename] = moduleObj;

		const dirPath = dirname(`/${filename}`);
		function localLoad(target) {
			const targetFilename = pathJoin(dirPath, `/${target}`).slice(1);
			return loadFile(targetFilename, false);
		}

		function localRequire(target) {
			// eslint-disable-next-line global-require, import/no-dynamic-require
			if (!target.startsWith('.')) return require(target);
			return localLoad(target).default;
		}

		function localImport(target) {
			if (!target.startsWith('.')) return import(target);
			return Promise.resolve(localLoad(target));
		}

		const js = filesObj[filename];
		assert(js, `Attempted to require non-existent file '${filename}'`);

		moduleObj.default = execFile(
			js, localRequire, localImport, (format === 'js' && !isEntry) ? 'cjs' : format,
			isEntry ? strictEnv : format === 'esm'
		);
		return moduleObj;
	}

	const resObj = {};
	for (const {name, filename} of fileMappings) {
		resObj[name] = loadFile(filename, true).default;
	}
	return resObj;
}

/* eslint-disable no-new-func */
function execFile(js, require, importFn, format, isStrictMode) {
	if (format === 'js') js = `return (${js}\n)`; // Brackets in case `js` begins with single-line comment
	if (isStrictMode) js = `'use strict';${js}`;

	if (format === 'esm') {
		const proxy = {exports: undefined, require, import: importFn};
		new Function(
			'$__proxy',
			js.replace(/(^|;\n*)export default/, (_, before) => `${before}$__proxy.exports=`)
				.replace(
					/(^|;\n*)import ([^ ]+) from ?("[^"]+")/g,
					(_, before, varName, path) => `${before}const ${varName}=$__proxy.require(${path})`
				)
				.replace(/(^|[^A-Za-z0_$])import\(/g, (_, before) => `${before}$__proxy.import(`)
		)(proxy);
		return proxy.exports;
	}

	// Convert `import(...)` to `require.$__import(...)`
	require.$__import = importFn;
	js = js.replace(/(^|[^A-Za-z0_$])import\(/g, (_, before) => `${before}require.$__import(`);

	// JS
	if (format === 'js') return new Function('require', js)(require);

	// CJS
	const mod = {exports: {}};
	new Function('module', 'exports', 'require', js)(mod, mod.exports, require);
	return mod.exports;
}
/* eslint-enable no-new-func */

/*
 * Code sanitization functions.
 */

function stripComments(js) {
	return stripSourceMapComment(stripEslintComments(js));
}

function stripEslintComments(js) {
	// NB: Comments cause Babel to add semicolons at end of blocks, which it otherwise doesn't
	return js.replace(/\/\/ eslint-disable-(?:next-)?line [^\n]+\n/g, '')
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
 * @returns {*|undefined} - Error thrown, or `undefined` if it doesn't throw
 */
function tryCatch(fn) { // eslint-disable-line consistent-return
	try {
		fn();
	} catch (err) {
		return err;
	}
}
