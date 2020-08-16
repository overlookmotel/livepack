/* --------------------
 * livepack module
 * Serialize
 * ------------------*/

'use strict';

// Modules
const assert = require('assert'),
	{isObject, isFunction, isBoolean, isString} = require('is-it-type');

// Imports
const Serializer = require('./serializer.js');

// Constants
const FORMATS = ['js', 'cjs', 'esm'],
	FORMAT_ALIASES = {commonjs: 'cjs', mjs: 'esm'};

// Exports

/**
 * Serialize value to Javascript code.
 *
 * @param {*} val - Value to serialize.
 * @param {Object} [options] - Options object
 * @param {string} [options.format='js'] - Output format - 'js' / 'esm' / 'cjs'
 * @param {boolean} [options.exec=false] - If true, export will be called
 * @param {boolean} [options.minify=true] - If false, JS is not minified (defaults to true)
 * @param {boolean} [options.inline] - If false, every object is a separate var
 *   (default inherits `options.minify`)
 * @param {boolean} [options.mangle] - If false, vars left with original names, rather than shortening
 *   (default inherits `options.minify`)
 * @param {boolean} [options.comments] - If true, comments are left in JS
 *   (default inherits `!options.minify`)
 * @param {boolean} [options.files=false] - If true, output array of files,
 *   each of form `{filename, content}`
 * @param {boolean} [options.sourceMaps=false] - If true, output will include source maps
 * @param {Function} [options.shouldPrintComment] - If provided, function is called with text of
 *   every comment encountered in source. If function returns true, the comment is retained in output.
 * @returns {string|Array<Object>} - Javascript code / array of file objects
 */
module.exports = function serialize(val, options) {
	// Conform options
	if (options == null) {
		options = {};
	} else {
		assert(isObject(options), 'options must be an object if provided');
		options = {...options};
	}

	// Get `format` option - default 'js'
	const {format} = options;
	if (format == null) {
		options.format = 'js';
	} else {
		assert(isString(format), 'options.format must be a string if provided');

		const alias = FORMAT_ALIASES[format];
		if (alias) {
			options.format = alias;
		} else {
			assert(
				FORMATS.includes(format),
				`options.format must be one of ${FORMATS.concat(Object.keys(FORMAT_ALIASES)).map(f => `'${f}'`).join(', ')} if provided`
			);
		}
	}

	// Get `exec`, `minify`, `inline`, `mangle`, `comments`, `files`, `sourceMaps` options.
	// Minifying turned on by default.
	// Inlining and comment stripping turned on/off by default in line with minifying.
	// Files array output turned off by default.
	// Source maps turned off by default.
	for (const optName of ['exec', 'minify', 'inline', 'mangle', 'comments', 'files', 'sourceMaps']) {
		const optValue = options[optName];
		assert(optValue == null || isBoolean(optValue), `options.${optName} must be a boolean if provided`);
	}

	if (options.exec == null) options.exec = false;
	if (options.minify == null) options.minify = true;
	if (options.inline == null) options.inline = options.minify;
	if (options.mangle == null) options.mangle = options.minify;
	if (options.comments == null) options.comments = !options.minify;
	if (options.files == null) options.files = false;
	if (options.sourceMaps == null) options.sourceMaps = false;

	// Conform `shouldPrintComment` option
	const {shouldPrintComment} = options;
	assert(
		shouldPrintComment == null || isFunction(shouldPrintComment),
		'options.shouldPrintComment must be a function if provided'
	);

	// Serialize value
	const serializer = new Serializer(options);
	return serializer.serialize(val);
};
