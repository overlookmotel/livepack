/* --------------------
 * livepack module
 * Serialize
 * ------------------*/

'use strict';

// Modules
const assert = require('assert'),
	{isObject, isBoolean, isString} = require('is-it-type');

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
 * @param {boolean} [options.minify=true] - If false, JS is not minified (defaults to true)
 * @param {boolean} [options.inline] - If false, every object is a separate var
 *   (default inherits `options.minify`)
 * @param {boolean} [options.mangle] - If false, vars left with original names, rather than shortening
 *   (default inherits `options.minify`)
 * @param {boolean} [options.comments] - If true, comments are left in JS
 *   (default inherits `!options.minify`)
 * @returns {string} - Javascript code
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
				`options.format must be one of ${(FORMATS.concat(Object.keys(FORMAT_ALIASES))).map(f => `'${f}'`).join(', ')} if provided`
			);
		}
	}

	// Get `minify`, `inline`, `mangle`, `comments` options.
	// Minifying turned on by default.
	// Inlining and comment stripping turned on/off by default in line with minifying.
	for (const optName of ['minify', 'inline', 'mangle', 'comments']) {
		const optValue = options[optName];
		assert(optValue == null || isBoolean(optValue), `options.${optName} must be a boolean if provided`);
	}

	if (options.minify == null) options.minify = true;
	if (options.inline == null) options.inline = options.minify;
	if (options.mangle == null) options.mangle = options.minify;
	if (options.comments == null) options.comments = !options.minify;

	// Serialize value
	const serializer = new Serializer(options);
	return serializer.serialize(val);
};
